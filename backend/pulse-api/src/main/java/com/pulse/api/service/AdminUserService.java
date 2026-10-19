package com.pulse.api.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.pulse.api.dto.AdminUserDtos;
import com.pulse.api.entity.ImConversation;
import com.pulse.api.entity.ImConversationMember;
import com.pulse.api.entity.ImFavorite;
import com.pulse.api.entity.ImFriend;
import com.pulse.api.entity.ImFriendDeleteLog;
import com.pulse.api.entity.ImMessage;
import com.pulse.api.entity.ImUserBlock;
import com.pulse.api.entity.MomentPost;
import com.pulse.api.entity.SysAdmin;
import com.pulse.api.entity.SysUser;
import com.pulse.api.mapper.ImConversationMapper;
import com.pulse.api.mapper.ImConversationMemberMapper;
import com.pulse.api.mapper.ImFavoriteMapper;
import com.pulse.api.mapper.ImFriendDeleteLogMapper;
import com.pulse.api.mapper.ImFriendMapper;
import com.pulse.api.mapper.ImMessageMapper;
import com.pulse.api.mapper.ImUserBlockMapper;
import com.pulse.api.mapper.MomentPostMapper;
import com.pulse.api.mapper.SysAdminMapper;
import com.pulse.api.mapper.SysUserMapper;
import com.pulse.api.support.UserIdentityAllocator;
import com.pulse.api.vo.AdminBlockedUserVO;
import com.pulse.api.vo.AdminFavoriteVO;
import com.pulse.api.vo.AdminFriendDeleteLogVO;
import com.pulse.api.vo.AdminFriendVO;
import com.pulse.api.vo.AdminOwnedCommunityVO;
import com.pulse.api.vo.AdminOwnedGroupVO;
import com.pulse.api.vo.AdminUserVO;
import com.pulse.api.vo.CommonGroupVO;
import com.pulse.common.constant.RedisKeys;
import com.pulse.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AdminUserService {
    private final SysUserMapper userMapper;
    private final SysAdminMapper adminMapper;
    private final ImConversationMapper conversationMapper;
    private final ImConversationMemberMapper memberMapper;
    private final ImMessageMapper messageMapper;
    private final MomentPostMapper momentPostMapper;
    private final ImUserBlockMapper userBlockMapper;
    private final ImFriendMapper friendMapper;
    private final ImFriendDeleteLogMapper friendDeleteLogMapper;
    private final ImFavoriteMapper favoriteMapper;
    private final PasswordEncoder passwordEncoder;
    private final StringRedisTemplate redis;
    private final JdbcTemplate jdbcTemplate;
    private final UserIdentityAllocator identityAllocator;
    private final GroupOwnerTransferService groupOwnerTransferService;
    private final DefaultFriendService defaultFriendService;
    private NicknameConfigService nicknameConfigService;
    private final ConversationService conversationService;
    private final SessionRevocationService sessionRevocationService;

    @Autowired
    public void setNicknameConfigService(NicknameConfigService nicknameConfigService) {
        this.nicknameConfigService = nicknameConfigService;
    }

    private String normalizeUserNickname(String raw) {
        if (nicknameConfigService != null) {
            return nicknameConfigService.normalizeUserNickname(raw);
        }
        String nickname = raw == null ? "" : raw.trim();
        if (!StringUtils.hasText(nickname)) {
            throw new BizException("用户昵称不能为空");
        }
        if (nickname.length() > 64) {
            throw new BizException("用户昵称不能超过64个字符");
        }
        return nickname;
    }

    public Map<String, Object> listUsers(
            int page,
            int size,
            String keyword,
            Integer status,
            Boolean online,
            Boolean activeToday,
            String createdFrom,
            String createdTo,
            String sortBy,
            String sortOrder
    ) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);
        Set<Long> onlineIds = listOnlineUserIds();

        LambdaQueryWrapper<SysUser> qw = new LambdaQueryWrapper<>();
        // 文件传输助手是系统内置账号，不属于可管理的普通用户，后台用户列表及其搜索候选均隐藏。
        qw.and(w -> w.eq(SysUser::getFileTransferAssistant, false)
                .or().isNull(SysUser::getFileTransferAssistant));
        if (status != null) {
            qw.eq(SysUser::getStatus, status);
        }
        if (StringUtils.hasText(keyword)) {
            // Split multi-word input so "昵称 PulseID" still finds the same user,
            // and use ILIKE for case-insensitive matching across the supported identifiers.
            String normalizedKeyword = keyword.trim().replaceAll("[，,；;]+", " ");
            for (String rawToken : normalizedKeyword.split("\\s+")) {
                String token = rawToken.replaceAll("[()\\-]", "");
                if (token.isBlank()) {
                    continue;
                }
                String pattern = "%" + token + "%";
                qw.and(w -> w
                        .apply("phone ILIKE {0}", pattern)
                        .or().apply("nickname ILIKE {0}", pattern)
                        .or().apply("pulse_id ILIKE {0}", pattern));
            }
        }
        if (online != null) {
            if (online) {
                if (onlineIds.isEmpty()) {
                    return emptyUserPage(safePage, safeSize);
                }
                qw.in(SysUser::getId, onlineIds);
            } else if (!onlineIds.isEmpty()) {
                qw.notIn(SysUser::getId, onlineIds);
            }
        }
        if (Boolean.TRUE.equals(activeToday)) {
            Set<Long> activeIds = collectTodayActiveUserIds();
            if (activeIds.isEmpty()) {
                return emptyUserPage(safePage, safeSize);
            }
            qw.in(SysUser::getId, activeIds);
        }
        OffsetDateTime fromAt = parseDayStart(createdFrom);
        OffsetDateTime toExclusive = parseDayEndExclusive(createdTo);
        if (fromAt != null) {
            qw.ge(SysUser::getCreatedAt, fromAt);
        }
        if (toExclusive != null) {
            qw.lt(SysUser::getCreatedAt, toExclusive);
        }
        applyUserSort(qw, sortBy, sortOrder, onlineIds);

        Page<SysUser> result = userMapper.selectPage(new Page<>(safePage, safeSize), qw);
        List<AdminUserVO> list = result.getRecords().stream()
                .map(u -> toVO(u, false))
                .collect(Collectors.toList());
        fillBlockCounts(list);
        fillFriendCounts(list);
        fillFavoriteCounts(list);
        fillFriendDeleteCounts(list);

        Map<String, Object> data = new HashMap<>();
        data.put("list", list);
        data.put("total", result.getTotal());
        data.put("page", safePage);
        data.put("size", safeSize);
        return data;
    }

    /**
     * sortBy: online(默认在线优先) / lastOnlineAt / createdAt
     * sortOrder: desc(默认) / asc
     */
    private void applyUserSort(
            LambdaQueryWrapper<SysUser> qw,
            String sortBy,
            String sortOrder,
            Set<Long> onlineIds
    ) {
        String by = StringUtils.hasText(sortBy) ? sortBy.trim() : "online";
        boolean asc = "asc".equalsIgnoreCase(sortOrder);
        String dir = asc ? "ASC" : "DESC";
        String nulls = asc ? "NULLS FIRST" : "NULLS LAST";

        switch (by) {
            case "createdAt", "created_at", "register" -> {
                if (asc) {
                    qw.orderByAsc(SysUser::getCreatedAt).orderByAsc(SysUser::getId);
                } else {
                    qw.orderByDesc(SysUser::getCreatedAt).orderByDesc(SysUser::getId);
                }
            }
            case "lastOnlineAt", "last_online_at", "lastOnline" -> {
                // 当前在线视为“现在”，其余用库内最近在线（空则回退注册时间）
                if (onlineIds != null && !onlineIds.isEmpty()) {
                    String inList = onlineIds.stream().map(String::valueOf).collect(Collectors.joining(","));
                    qw.last("ORDER BY CASE WHEN id IN (" + inList + ") THEN NOW() "
                            + "ELSE COALESCE(last_online_at, created_at) END " + dir + " " + nulls
                            + ", id " + dir);
                } else {
                    qw.last("ORDER BY COALESCE(last_online_at, created_at) " + dir + " " + nulls
                            + ", id " + dir);
                }
            }
            default -> {
                // 在线优先，其次 id 倒序
                if (onlineIds != null && !onlineIds.isEmpty()) {
                    String inList = onlineIds.stream().map(String::valueOf).collect(Collectors.joining(","));
                    qw.last("ORDER BY CASE WHEN id IN (" + inList + ") THEN 0 ELSE 1 END, id DESC");
                } else {
                    qw.orderByDesc(SysUser::getId);
                }
            }
        }
    }

    public AdminUserVO getUser(Long id) {
        AdminUserVO vo = toVO(requireUser(id), true);
        vo.setBlockCount(countBlocksOf(id));
        vo.setFriendCount(countFriendsOf(id));
        vo.setFavoriteCount(countFavoritesOf(id));
        vo.setFriendDeleteCount(countFriendDeletesOf(id));
        return vo;
    }

    public List<AdminBlockedUserVO> listBlockedUsers(Long userId) {
        requireUser(userId);
        List<ImUserBlock> rows = userBlockMapper.selectList(new LambdaQueryWrapper<ImUserBlock>()
                .eq(ImUserBlock::getUserId, userId)
                .orderByDesc(ImUserBlock::getCreatedAt));
        List<AdminBlockedUserVO> out = new ArrayList<>();
        for (ImUserBlock b : rows) {
            SysUser u = userMapper.selectById(b.getBlockedUserId());
            if (u == null) {
                continue;
            }
            out.add(AdminBlockedUserVO.builder()
                    .userId(u.getId())
                    .phone(u.getPhone())
                    .pulseId(u.getPulseId())
                    .nickname(u.getNickname())
                    .avatarUrl(u.getAvatarUrl())
                    .remark(b.getRemark())
                    .blockedAt(b.getCreatedAt())
                    .build());
        }
        return out;
    }

    public List<AdminFriendVO> listFriends(Long userId) {
        requireUser(userId);
        List<ImFriend> rows = friendMapper.selectList(new LambdaQueryWrapper<ImFriend>()
                .eq(ImFriend::getUserId, userId)
                .orderByDesc(ImFriend::getCreatedAt));
        List<AdminFriendVO> out = new ArrayList<>();
        for (ImFriend f : rows) {
            SysUser u = userMapper.selectById(f.getFriendId());
            if (u == null || Boolean.TRUE.equals(u.getFileTransferAssistant())) {
                continue;
            }
            String initiatorName = null;
            if (f.getAddInitiatorId() != null) {
                SysUser initiator = userMapper.selectById(f.getAddInitiatorId());
                if (initiator != null) {
                    initiatorName = initiator.getNickname();
                }
            }
            List<CommonGroupVO> commonGroups = listCommonGroupsBetween(userId, u.getId());
            out.add(AdminFriendVO.builder()
                    .userId(u.getId())
                    .phone(u.getPhone())
                    .pulseId(u.getPulseId())
                    .nickname(u.getNickname())
                    .avatarUrl(u.getAvatarUrl())
                    .remark(f.getRemark())
                    .addSource(f.getAddSource())
                    .addSourceLabel(addSourceLabel(f.getAddSource()))
                    .addInitiatorId(f.getAddInitiatorId())
                    .addInitiatorNickname(initiatorName)
                    .friendSince(f.getCreatedAt())
                    .online(isOnline(u.getId()))
                    .commonGroupCount(commonGroups.size())
                    .commonGroups(commonGroups)
                    .build());
        }
        return out;
    }

    public List<AdminFriendDeleteLogVO> listFriendDeleteLogs(Long userId) {
        requireUser(userId);
        List<ImFriendDeleteLog> rows = friendDeleteLogMapper.selectList(new LambdaQueryWrapper<ImFriendDeleteLog>()
                .eq(ImFriendDeleteLog::getUserId, userId)
                .orderByDesc(ImFriendDeleteLog::getDeletedAt)
                .last("LIMIT 200"));
        SysUser self = userMapper.selectById(userId);
        List<AdminFriendDeleteLogVO> out = new ArrayList<>();
        for (ImFriendDeleteLog row : rows) {
            SysUser peer = userMapper.selectById(row.getFriendId());
            out.add(AdminFriendDeleteLogVO.builder()
                    .id(row.getId())
                    .userId(row.getUserId())
                    .userNickname(self != null ? self.getNickname() : null)
                    .userPhone(self != null ? self.getPhone() : null)
                    .userPulseId(self != null ? self.getPulseId() : null)
                    .friendId(row.getFriendId())
                    .friendNickname(peer != null ? peer.getNickname() : null)
                    .friendPhone(peer != null ? peer.getPhone() : null)
                    .friendPulseId(peer != null ? peer.getPulseId() : null)
                    .friendAvatarUrl(peer != null ? peer.getAvatarUrl() : null)
                    .addSource(row.getAddSource())
                    .addSourceLabel(addSourceLabel(row.getAddSource()))
                    .addInitiatorId(row.getAddInitiatorId())
                    .friendSince(row.getFriendSince())
                    .reason(row.getReason())
                    .reasonLabel(reasonLabel(row.getReason()))
                    .deletedAt(row.getDeletedAt())
                    .build());
        }
        return out;
    }

    public List<AdminFavoriteVO> listFavorites(Long userId) {
        requireUser(userId);
        List<ImFavorite> rows = favoriteMapper.selectList(new LambdaQueryWrapper<ImFavorite>()
                .eq(ImFavorite::getUserId, userId)
                .orderByDesc(ImFavorite::getCreatedAt)
                .last("LIMIT 200"));
        List<AdminFavoriteVO> out = new ArrayList<>();
        for (ImFavorite f : rows) {
            int type = f.getMsgType() == null ? 0 : f.getMsgType();
            out.add(AdminFavoriteVO.builder()
                    .id(f.getId())
                    .conversationId(f.getConversationId())
                    .msgId(f.getMsgId())
                    .msgType(type)
                    .msgTypeLabel(msgTypeLabel(type))
                    .content(f.getContent())
                    .contentPreview(favoritePreview(type, f.getContent()))
                    .fromNickname(f.getFromNickname())
                    .sourceTitle(f.getSourceTitle())
                    .createdAt(f.getCreatedAt())
                    .build());
        }
        hydrateFavoriteContents(out);
        return out;
    }

    /** 全局好友关系列表 */
    public Map<String, Object> listAllFriends(int page, int size, String keyword, Long ownerUserId) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);
        StringBuilder where = new StringBuilder("""
                WHERE 1=1
                  AND (ou.file_transfer_assistant = FALSE OR ou.file_transfer_assistant IS NULL)
                  AND (pu.file_transfer_assistant = FALSE OR pu.file_transfer_assistant IS NULL)
                """);
        List<Object> args = new ArrayList<>();
        if (ownerUserId != null && ownerUserId > 0) {
            where.append(" AND f.user_id = ? ");
            args.add(ownerUserId);
        }
        if (StringUtils.hasText(keyword)) {
            String kw = "%" + keyword.trim() + "%";
            where.append("""
                     AND (
                        COALESCE(ou.nickname,'') LIKE ? OR COALESCE(ou.phone,'') LIKE ? OR COALESCE(ou.pulse_id,'') LIKE ?
                        OR COALESCE(pu.nickname,'') LIKE ? OR COALESCE(pu.phone,'') LIKE ? OR COALESCE(pu.pulse_id,'') LIKE ?
                        OR COALESCE(f.remark,'') LIKE ?
                     )
                    """);
            for (int i = 0; i < 7; i++) {
                args.add(kw);
            }
        }
        String from = """
                FROM im_friend f
                LEFT JOIN sys_user ou ON ou.id = f.user_id
                LEFT JOIN sys_user pu ON pu.id = f.friend_id
                """;
        Long total = jdbcTemplate.queryForObject("SELECT COUNT(*) " + from + where, Long.class, args.toArray());
        String listSql = """
                SELECT f.user_id AS owner_user_id, ou.nickname AS owner_nickname, ou.phone AS owner_phone, ou.pulse_id AS owner_pulse_id,
                       f.friend_id AS peer_user_id, pu.nickname AS peer_nickname, pu.phone AS peer_phone, pu.pulse_id AS peer_pulse_id,
                       pu.avatar_url AS peer_avatar_url, f.remark, f.add_source, f.add_initiator_id, f.created_at AS friend_since,
                       iu.nickname AS initiator_nickname
                """ + from + """
                LEFT JOIN sys_user iu ON iu.id = f.add_initiator_id
                """ + where + " ORDER BY f.created_at DESC NULLS LAST, f.id DESC LIMIT ? OFFSET ? ";
        List<Object> listArgs = new ArrayList<>(args);
        listArgs.add(safeSize);
        listArgs.add((safePage - 1L) * safeSize);
        List<AdminFriendVO> list = jdbcTemplate.query(listSql, (rs, i) -> {
            Long initiatorId = rs.getObject("add_initiator_id") == null ? null : rs.getLong("add_initiator_id");
            String source = rs.getString("add_source");
            Long peerId = rs.getObject("peer_user_id") == null ? null : rs.getLong("peer_user_id");
            Long ownerId = rs.getObject("owner_user_id") == null ? null : rs.getLong("owner_user_id");
            List<CommonGroupVO> commonGroups = listCommonGroupsBetween(ownerId, peerId);
            return AdminFriendVO.builder()
                    .ownerUserId(ownerId)
                    .ownerNickname(rs.getString("owner_nickname"))
                    .ownerPhone(rs.getString("owner_phone"))
                    .ownerPulseId(rs.getString("owner_pulse_id"))
                    .userId(peerId)
                    .nickname(rs.getString("peer_nickname"))
                    .phone(rs.getString("peer_phone"))
                    .pulseId(rs.getString("peer_pulse_id"))
                    .avatarUrl(rs.getString("peer_avatar_url"))
                    .remark(rs.getString("remark"))
                    .addSource(source)
                    .addSourceLabel(addSourceLabel(source))
                    .addInitiatorId(initiatorId)
                    .addInitiatorNickname(rs.getString("initiator_nickname"))
                    .friendSince(toOffset(rs.getObject("friend_since")))
                    .online(peerId != null && isOnline(peerId))
                    .commonGroupCount(commonGroups.size())
                    .commonGroups(commonGroups)
                    .build();
        }, listArgs.toArray());
        return pageResult(list, total == null ? 0 : total, safePage, safeSize);
    }

    /**
     * 后台手动建立双向好友。remark 写入「用户」对「好友」一侧的备注。
     */
    @Transactional
    public AdminFriendVO createFriendship(Long userId, Long friendId, String remark) {
        if (userId == null || friendId == null || userId <= 0 || friendId <= 0) {
            throw new BizException("请选择用户和好友");
        }
        if (userId.equals(friendId)) {
            throw new BizException("不能添加自己为好友");
        }
        SysUser owner = requireUser(userId);
        SysUser peer = requireUser(friendId);
        Long exists = friendMapper.selectCount(new LambdaQueryWrapper<ImFriend>()
                .eq(ImFriend::getUserId, userId)
                .eq(ImFriend::getFriendId, friendId));
        if (exists != null && exists > 0) {
            throw new BizException("双方已是好友");
        }
        String rem = StringUtils.hasText(remark) ? remark.trim() : null;
        if (rem != null && rem.length() > 64) {
            rem = rem.substring(0, 64);
        }
        OffsetDateTime now = OffsetDateTime.now();
        insertFriendRow(userId, friendId, rem, now);
        insertFriendRow(friendId, userId, null, now);
        try {
            jdbcTemplate.update(
                    "DELETE FROM im_friend_request WHERE (from_user_id=? AND to_user_id=?) OR (from_user_id=? AND to_user_id=?)",
                    userId, friendId, friendId, userId);
        } catch (Exception ignored) {
            // ignore
        }
        try {
            conversationService.getOrCreatePrivate(userId, friendId);
        } catch (Exception e) {
            // 会话可在用户端首次打开时补齐
        }
        List<CommonGroupVO> commonGroups = listCommonGroupsBetween(userId, friendId);
        return AdminFriendVO.builder()
                .ownerUserId(owner.getId())
                .ownerNickname(owner.getNickname())
                .ownerPhone(owner.getPhone())
                .ownerPulseId(owner.getPulseId())
                .userId(peer.getId())
                .nickname(peer.getNickname())
                .phone(peer.getPhone())
                .pulseId(peer.getPulseId())
                .avatarUrl(peer.getAvatarUrl())
                .remark(rem)
                .addSource("admin")
                .addSourceLabel(addSourceLabel("admin"))
                .friendSince(now)
                .online(isOnline(peer.getId()))
                .commonGroupCount(commonGroups.size())
                .commonGroups(commonGroups)
                .build();
    }

    private void insertFriendRow(Long userId, Long friendId, String remark, OffsetDateTime since) {
        ImFriend existing = friendMapper.selectOne(new LambdaQueryWrapper<ImFriend>()
                .eq(ImFriend::getUserId, userId)
                .eq(ImFriend::getFriendId, friendId)
                .last("LIMIT 1"));
        if (existing != null) {
            if (StringUtils.hasText(remark)) {
                existing.setRemark(remark);
                existing.setAddSource("admin");
                friendMapper.updateById(existing);
            }
            return;
        }
        ImFriend row = new ImFriend();
        row.setUserId(userId);
        row.setFriendId(friendId);
        row.setRemark(remark);
        row.setAddSource("admin");
        row.setCreatedAt(since);
        friendMapper.insert(row);
    }

    /** 两用户共同所在的群聊 */
    private List<CommonGroupVO> listCommonGroupsBetween(Long userId, Long peerUserId) {
        if (userId == null || peerUserId == null || userId.equals(peerUserId)) {
            return List.of();
        }
        try {
            return jdbcTemplate.query("""
                    SELECT c.id, c.title, c.avatar_url,
                           (SELECT COUNT(*) FROM im_conversation_member m WHERE m.conversation_id = c.id) AS member_count
                    FROM im_conversation c
                    WHERE c.type = 2
                      AND EXISTS (
                          SELECT 1 FROM im_conversation_member m1
                          WHERE m1.conversation_id = c.id AND m1.user_id = ?
                      )
                      AND EXISTS (
                          SELECT 1 FROM im_conversation_member m2
                          WHERE m2.conversation_id = c.id AND m2.user_id = ?
                      )
                    ORDER BY c.updated_at DESC NULLS LAST, c.id DESC
                    """,
                    (rs, i) -> CommonGroupVO.builder()
                            .id(rs.getLong("id"))
                            .title(StringUtils.hasText(rs.getString("title")) ? rs.getString("title") : "群聊")
                            .avatarUrl(rs.getString("avatar_url"))
                            .memberCount(rs.getInt("member_count"))
                            .build(),
                    userId, peerUserId);
        } catch (Exception e) {
            return List.of();
        }
    }

    /** 全局黑名单列表 */
    public Map<String, Object> listAllBlocks(int page, int size, String keyword, Long ownerUserId) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);
        StringBuilder where = new StringBuilder(" WHERE 1=1 ");
        List<Object> args = new ArrayList<>();
        if (ownerUserId != null && ownerUserId > 0) {
            where.append(" AND b.user_id = ? ");
            args.add(ownerUserId);
        }
        if (StringUtils.hasText(keyword)) {
            String kw = "%" + keyword.trim() + "%";
            where.append("""
                     AND (
                        COALESCE(ou.nickname,'') LIKE ? OR COALESCE(ou.phone,'') LIKE ? OR COALESCE(ou.pulse_id,'') LIKE ?
                        OR COALESCE(pu.nickname,'') LIKE ? OR COALESCE(pu.phone,'') LIKE ? OR COALESCE(pu.pulse_id,'') LIKE ?
                     )
                    """);
            for (int i = 0; i < 6; i++) {
                args.add(kw);
            }
        }
        String from = """
                FROM im_user_block b
                LEFT JOIN sys_user ou ON ou.id = b.user_id
                LEFT JOIN sys_user pu ON pu.id = b.blocked_user_id
                """;
        Long total = jdbcTemplate.queryForObject("SELECT COUNT(*) " + from + where, Long.class, args.toArray());
        String listSql = """
                SELECT b.user_id AS owner_user_id, ou.nickname AS owner_nickname, ou.phone AS owner_phone, ou.pulse_id AS owner_pulse_id,
                       b.blocked_user_id AS peer_user_id, pu.nickname AS peer_nickname, pu.phone AS peer_phone, pu.pulse_id AS peer_pulse_id,
                       pu.avatar_url AS peer_avatar_url, b.remark, b.created_at AS blocked_at
                """ + from + where + " ORDER BY b.created_at DESC NULLS LAST, b.id DESC LIMIT ? OFFSET ? ";
        List<Object> listArgs = new ArrayList<>(args);
        listArgs.add(safeSize);
        listArgs.add((safePage - 1L) * safeSize);
        List<AdminBlockedUserVO> list = jdbcTemplate.query(listSql, (rs, i) -> AdminBlockedUserVO.builder()
                .ownerUserId(rs.getObject("owner_user_id") == null ? null : rs.getLong("owner_user_id"))
                .ownerNickname(rs.getString("owner_nickname"))
                .ownerPhone(rs.getString("owner_phone"))
                .ownerPulseId(rs.getString("owner_pulse_id"))
                .userId(rs.getObject("peer_user_id") == null ? null : rs.getLong("peer_user_id"))
                .nickname(rs.getString("peer_nickname"))
                .phone(rs.getString("peer_phone"))
                .pulseId(rs.getString("peer_pulse_id"))
                .avatarUrl(rs.getString("peer_avatar_url"))
                .remark(rs.getString("remark"))
                .blockedAt(toOffset(rs.getObject("blocked_at")))
                .build(), listArgs.toArray());
        return pageResult(list, total == null ? 0 : total, safePage, safeSize);
    }

    /** 全局用户收藏列表 */
    public Map<String, Object> listAllFavorites(int page, int size, String keyword, Long ownerUserId, Integer msgType) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);
        StringBuilder where = new StringBuilder(" WHERE 1=1 ");
        List<Object> args = new ArrayList<>();
        if (ownerUserId != null && ownerUserId > 0) {
            where.append(" AND fav.user_id = ? ");
            args.add(ownerUserId);
        }
        if (msgType != null) {
            where.append(" AND fav.msg_type = ? ");
            args.add(msgType);
        }
        if (StringUtils.hasText(keyword)) {
            String kw = "%" + keyword.trim() + "%";
            where.append("""
                     AND (
                        COALESCE(ou.nickname,'') LIKE ? OR COALESCE(ou.phone,'') LIKE ? OR COALESCE(ou.pulse_id,'') LIKE ?
                        OR COALESCE(fav.from_nickname,'') LIKE ? OR COALESCE(fav.source_title,'') LIKE ?
                        OR COALESCE(fav.content,'') LIKE ?
                     )
                    """);
            for (int i = 0; i < 6; i++) {
                args.add(kw);
            }
        }
        String from = """
                FROM im_favorite fav
                LEFT JOIN sys_user ou ON ou.id = fav.user_id
                """;
        Long total = jdbcTemplate.queryForObject("SELECT COUNT(*) " + from + where, Long.class, args.toArray());
        String listSql = """
                SELECT fav.id, fav.user_id AS owner_user_id, ou.nickname AS owner_nickname, ou.phone AS owner_phone, ou.pulse_id AS owner_pulse_id,
                       fav.conversation_id, fav.msg_id, fav.msg_type, fav.content, fav.from_nickname, fav.source_title, fav.created_at
                """ + from + where + " ORDER BY fav.created_at DESC NULLS LAST, fav.id DESC LIMIT ? OFFSET ? ";
        List<Object> listArgs = new ArrayList<>(args);
        listArgs.add(safeSize);
        listArgs.add((safePage - 1L) * safeSize);
        List<AdminFavoriteVO> list = jdbcTemplate.query(listSql, (rs, i) -> {
            int type = rs.getObject("msg_type") == null ? 0 : rs.getInt("msg_type");
            String content = rs.getString("content");
            return AdminFavoriteVO.builder()
                    .id(rs.getLong("id"))
                    .ownerUserId(rs.getObject("owner_user_id") == null ? null : rs.getLong("owner_user_id"))
                    .ownerNickname(rs.getString("owner_nickname"))
                    .ownerPhone(rs.getString("owner_phone"))
                    .ownerPulseId(rs.getString("owner_pulse_id"))
                    .conversationId(rs.getObject("conversation_id") == null ? null : rs.getLong("conversation_id"))
                    .msgId(rs.getString("msg_id"))
                    .msgType(type)
                    .msgTypeLabel(msgTypeLabel(type))
                    .content(content)
                    .contentPreview(favoritePreview(type, content))
                    .fromNickname(rs.getString("from_nickname"))
                    .sourceTitle(rs.getString("source_title"))
                    .createdAt(toOffset(rs.getObject("created_at")))
                    .build();
        }, listArgs.toArray());
        hydrateFavoriteContents(list);
        return pageResult(list, total == null ? 0 : total, safePage, safeSize);
    }

    /** 全局删友记录列表 */
    public Map<String, Object> listAllFriendDeleteLogs(int page, int size, String keyword, Long ownerUserId, String reason) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);
        StringBuilder where = new StringBuilder(" WHERE 1=1 ");
        List<Object> args = new ArrayList<>();
        if (ownerUserId != null && ownerUserId > 0) {
            where.append(" AND d.user_id = ? ");
            args.add(ownerUserId);
        }
        if (StringUtils.hasText(reason)) {
            where.append(" AND d.reason = ? ");
            args.add(reason.trim());
        }
        if (StringUtils.hasText(keyword)) {
            String kw = "%" + keyword.trim() + "%";
            where.append("""
                     AND (
                        COALESCE(ou.nickname,'') LIKE ? OR COALESCE(ou.phone,'') LIKE ? OR COALESCE(ou.pulse_id,'') LIKE ?
                        OR COALESCE(pu.nickname,'') LIKE ? OR COALESCE(pu.phone,'') LIKE ? OR COALESCE(pu.pulse_id,'') LIKE ?
                     )
                    """);
            for (int i = 0; i < 6; i++) {
                args.add(kw);
            }
        }
        String from = """
                FROM im_friend_delete_log d
                LEFT JOIN sys_user ou ON ou.id = d.user_id
                LEFT JOIN sys_user pu ON pu.id = d.friend_id
                """;
        Long total = jdbcTemplate.queryForObject("SELECT COUNT(*) " + from + where, Long.class, args.toArray());
        String listSql = """
                SELECT d.id, d.user_id, ou.nickname AS user_nickname, ou.phone AS user_phone, ou.pulse_id AS user_pulse_id,
                       d.friend_id, pu.nickname AS friend_nickname, pu.phone AS friend_phone, pu.pulse_id AS friend_pulse_id,
                       pu.avatar_url AS friend_avatar_url, d.add_source, d.add_initiator_id, d.friend_since, d.reason, d.deleted_at
                """ + from + where + " ORDER BY d.deleted_at DESC NULLS LAST, d.id DESC LIMIT ? OFFSET ? ";
        List<Object> listArgs = new ArrayList<>(args);
        listArgs.add(safeSize);
        listArgs.add((safePage - 1L) * safeSize);
        List<AdminFriendDeleteLogVO> list = jdbcTemplate.query(listSql, (rs, i) -> {
            String source = rs.getString("add_source");
            String reasonVal = rs.getString("reason");
            return AdminFriendDeleteLogVO.builder()
                    .id(rs.getLong("id"))
                    .userId(rs.getObject("user_id") == null ? null : rs.getLong("user_id"))
                    .userNickname(rs.getString("user_nickname"))
                    .userPhone(rs.getString("user_phone"))
                    .userPulseId(rs.getString("user_pulse_id"))
                    .friendId(rs.getObject("friend_id") == null ? null : rs.getLong("friend_id"))
                    .friendNickname(rs.getString("friend_nickname"))
                    .friendPhone(rs.getString("friend_phone"))
                    .friendPulseId(rs.getString("friend_pulse_id"))
                    .friendAvatarUrl(rs.getString("friend_avatar_url"))
                    .addSource(source)
                    .addSourceLabel(addSourceLabel(source))
                    .addInitiatorId(rs.getObject("add_initiator_id") == null ? null : rs.getLong("add_initiator_id"))
                    .friendSince(toOffset(rs.getObject("friend_since")))
                    .reason(reasonVal)
                    .reasonLabel(reasonLabel(reasonVal))
                    .deletedAt(toOffset(rs.getObject("deleted_at")))
                    .build();
        }, listArgs.toArray());
        return pageResult(list, total == null ? 0 : total, safePage, safeSize);
    }

    private static Map<String, Object> pageResult(List<?> list, long total, int page, int size) {
        Map<String, Object> data = new HashMap<>();
        data.put("list", list);
        data.put("total", total);
        data.put("page", page);
        data.put("size", size);
        return data;
    }

    private static OffsetDateTime toOffset(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof OffsetDateTime odt) {
            return odt;
        }
        if (value instanceof java.sql.Timestamp ts) {
            return ts.toInstant().atOffset(java.time.ZoneOffset.ofHours(8));
        }
        if (value instanceof java.time.LocalDateTime ldt) {
            return ldt.atOffset(java.time.ZoneOffset.ofHours(8));
        }
        if (value instanceof java.time.Instant instant) {
            return instant.atOffset(java.time.ZoneOffset.ofHours(8));
        }
        return null;
    }

    @Transactional
    public AdminUserVO createUser(AdminUserDtos.CreateUserReq req) {
        if (findByPhone(req.getPhone()) != null) {
            throw new BizException("手机号已注册");
        }
        SysUser user = new SysUser();
        user.setId(identityAllocator.allocateUserId());
        user.setPhone(req.getPhone().trim());
        user.setPasswordHash(passwordEncoder.encode(req.getPassword()));
        user.setWalletBalance(0L);
        user.setNickname(normalizeUserNickname(req.getNickname()));
        user.setAvatarUrl(normalizeAvatarUrl(req.getAvatarUrl()));
        user.setGender(blankToNull(req.getGender()));
        user.setRegion(blankToNull(req.getRegion()));
        user.setSignature(blankToNull(req.getSignature()));
        user.setStatus(1);
        user.setPulseId(identityAllocator.allocatePulseId());
        user.setCreatedAt(OffsetDateTime.now());
        user.setUpdatedAt(OffsetDateTime.now());
        userMapper.insert(user);
        defaultFriendService.applyToNewUser(user.getId());
        return toVO(user, true);
    }

    @Transactional
    public AdminUserVO updateUser(Long id, AdminUserDtos.UpdateUserReq req) {
        SysUser user = requireUser(id);
        if (req.getNickname() != null) {
            user.setNickname(normalizeUserNickname(req.getNickname()));
        }
        if (req.getAvatarUrl() != null) {
            user.setAvatarUrl(normalizeAvatarUrl(req.getAvatarUrl()));
        }
        if (req.getGender() != null) {
            user.setGender(blankToNull(req.getGender()));
        }
        if (req.getRegion() != null) {
            user.setRegion(blankToNull(req.getRegion()));
        }
        if (req.getSignature() != null) {
            user.setSignature(blankToNull(req.getSignature()));
        }
        if (req.getBirthday() != null) {
            String raw = req.getBirthday().trim();
            if (!StringUtils.hasText(raw)) {
                user.setBirthday(null);
            } else {
                try {
                    user.setBirthday(LocalDate.parse(raw));
                } catch (Exception e) {
                    throw new BizException("生日格式不正确，应为 yyyy-MM-dd");
                }
            }
        }
        applyFriendPermissions(user, req);
        user.setUpdatedAt(OffsetDateTime.now());
        userMapper.updateById(user);
        return toVO(user, false);
    }

    @Transactional
    public AdminUserVO updateStatus(Long id, AdminUserDtos.UpdateStatusReq req) {
        Integer status = req.getStatus();
        if (status == null || (status != 0 && status != 1)) {
            throw new BizException("状态仅支持 0（封禁）或 1（启用）");
        }
        SysUser user = requireUser(id);
        user.setStatus(status);
        if (status == 1) {
            user.setBanUntil(null);
            user.setBanReason(null);
        } else {
            Integer days = req.getBanDays();
            if (days == null || days <= 0) {
                user.setBanUntil(null); // 永久
            } else {
                if (days > 3650) {
                    throw new BizException("封禁天数不能超过 3650 天");
                }
                user.setBanUntil(OffsetDateTime.now().plusDays(days));
            }
            String reason = req.getBanReason();
            user.setBanReason(StringUtils.hasText(reason) ? reason.trim() : null);
        }
        user.setUpdatedAt(OffsetDateTime.now());
        userMapper.updateById(user);
        if (status == 0) {
            sessionRevocationService.revokeAllSessions(user.getId(), "account_banned");
        }
        return toVO(user, false);
    }

    @Transactional
    public void resetPassword(Long id, String password) {
        SysUser user = requireUser(id);
        user.setPasswordHash(passwordEncoder.encode(password));
        user.setUpdatedAt(OffsetDateTime.now());
        userMapper.updateById(user);
    }

    public List<AdminOwnedGroupVO> listOwnedGroups(Long userId) {
        requireUser(userId);
        return buildOwnedGroups(userId);
    }

    public List<AdminOwnedCommunityVO> listOwnedCommunities(Long userId) {
        requireUser(userId);
        return jdbcTemplate.query("""
                SELECT id, name, member_count, status
                  FROM community
                 WHERE owner_id=?
                 ORDER BY id DESC
                """, (rs, rowNum) -> AdminOwnedCommunityVO.builder()
                .communityId(rs.getLong("id"))
                .name(rs.getString("name"))
                .memberCount(rs.getInt("member_count"))
                .status(rs.getString("status"))
                .build(), userId);
    }

    /**
     * 删除用户。若其担任群主且群内还有其他成员，必须通过 transfers 指定每个群的新群主。
     * 仅群主一人的群将自动解散。
     */
    @Transactional
    public void deleteUser(Long id, List<AdminUserDtos.OwnerTransfer> transfers, Long operatorAdminId) {
        deleteUser(id, transfers, operatorAdminId, null);
    }

    @Transactional
    public void deleteUser(
            Long id,
            List<AdminUserDtos.OwnerTransfer> transfers,
            Long operatorAdminId,
            Boolean deleteOwnedCommunities
    ) {
        SysUser user = requireUser(id);
        boolean deleteCommunities = Boolean.TRUE.equals(deleteOwnedCommunities);
        List<AdminOwnedCommunityVO> ownedCommunities = listOwnedCommunities(id);
        if (!ownedCommunities.isEmpty() && !deleteCommunities) {
            String names = ownedCommunities.stream()
                    .map(c -> StringUtils.hasText(c.getName()) ? c.getName() : ("圈子#" + c.getCommunityId()))
                    .collect(Collectors.joining("、"));
            throw new BizException("该用户是以下圈子的圈主，请先确认是否删除圈子：" + names);
        }
        List<AdminOwnedGroupVO> owned = buildOwnedGroups(id);
        Map<Long, Long> transferMap = new HashMap<>();
        if (transfers != null) {
            for (AdminUserDtos.OwnerTransfer t : transfers) {
                if (t == null || t.getConversationId() == null || t.getNewOwnerId() == null) {
                    continue;
                }
                transferMap.put(t.getConversationId(), t.getNewOwnerId());
            }
        }

        List<String> needTransferTitles = new ArrayList<>();
        for (AdminOwnedGroupVO g : owned) {
            if (Boolean.TRUE.equals(g.getMustDissolve())) {
                continue;
            }
            Long newOwnerId = transferMap.get(g.getConversationId());
            if (newOwnerId == null) {
                needTransferTitles.add(StringUtils.hasText(g.getTitle()) ? g.getTitle() : ("群#" + g.getConversationId()));
            }
        }
        if (!needTransferTitles.isEmpty()) {
            throw new BizException("该用户是群主，请先为以下群指定新群主：" + String.join("、", needTransferTitles));
        }

        String operatorNickname = resolveAdminNickname(operatorAdminId);

        for (AdminOwnedGroupVO g : owned) {
            if (Boolean.TRUE.equals(g.getMustDissolve())) {
                dissolveGroup(g.getConversationId());
                continue;
            }
            Long newOwnerId = transferMap.get(g.getConversationId());
            applyOwnerTransfer(g.getConversationId(), id, newOwnerId, user, operatorAdminId, operatorNickname);
        }

        deleteUserRelatedData(id, deleteCommunities);

        userMapper.deleteById(id);
        redis.delete(RedisKeys.online(id));
        redis.delete(RedisKeys.conn(id));
        redis.delete(RedisKeys.lastOnline(id));
    }

    /**
     * 清理用户删除前的全部用户关联数据。
     *
     * 社区表是在早期用户删除逻辑之后加入的，不能依赖数据库外键级联：
     * 现有生产库中的部分外键没有 ON DELETE CASCADE，必须按依赖顺序显式清理。
     * 只有管理员明确确认时，用户自己创建的社区才会连同内容、订单和收益记录一并删除；
     * 用户只是成员的社区则只清理该用户的成员、内容和互动记录。
     */
    private void deleteUserRelatedData(Long userId, boolean deleteCommunities) {
        if (deleteCommunities) {
            deleteOwnedCommunities(userId);
        }
        deleteCommunityUserData(userId);
        deleteWalletUserData(userId);
        deleteLegacyUserData(userId);
    }

    private void deleteOwnedCommunities(Long userId) {
        // income.order_id -> community_order.id，必须先删收益，再删订单。
        jdbcTemplate.update("""
                DELETE FROM community_income
                 WHERE owner_id=?
                    OR order_id IN (SELECT id FROM community_order WHERE buyer_id=?)
                    OR community_id IN (SELECT id FROM community WHERE owner_id=?)
                """, userId, userId, userId);
        jdbcTemplate.update("""
                DELETE FROM community_order
                 WHERE buyer_id=?
                    OR community_id IN (SELECT id FROM community WHERE owner_id=?)
                """, userId, userId);

        // 举报没有指向帖子/评论的外键，删除目标内容前主动清掉，避免残留无效举报。
        jdbcTemplate.update("""
                DELETE FROM community_report
                 WHERE reporter_id=?
                    OR (target_type='COMMUNITY' AND target_id IN
                        (SELECT id FROM community WHERE owner_id=?))
                    OR (target_type='POST' AND target_id IN
                        (SELECT p.id FROM community_post p
                          JOIN community c ON c.id=p.community_id
                         WHERE c.owner_id=?))
                    OR (target_type='COMMENT' AND target_id IN
                        (SELECT pc.id FROM community_post_comment pc
                          JOIN community_post p ON p.id=pc.post_id
                          JOIN community c ON c.id=p.community_id
                         WHERE c.owner_id=?))
                """, userId, userId, userId, userId);

        jdbcTemplate.update("""
                DELETE FROM community_post_comment_like
                 WHERE comment_id IN
                    (SELECT pc.id FROM community_post_comment pc
                      JOIN community_post p ON p.id=pc.post_id
                      JOIN community c ON c.id=p.community_id
                     WHERE c.owner_id=?)
                """, userId);
        jdbcTemplate.update("""
                DELETE FROM community_post_like
                 WHERE post_id IN
                    (SELECT p.id FROM community_post p
                      JOIN community c ON c.id=p.community_id
                     WHERE c.owner_id=?)
                """, userId);
        jdbcTemplate.update("""
                DELETE FROM community_post_favorite
                 WHERE post_id IN
                    (SELECT p.id FROM community_post p
                      JOIN community c ON c.id=p.community_id
                     WHERE c.owner_id=?)
                """, userId);
        // 评论有自引用 parent_id，先断开父子关系再删除社区动态评论。
        jdbcTemplate.update("""
                UPDATE community_post_comment
                   SET parent_id=NULL
                 WHERE parent_id IN
                    (SELECT pc.id FROM community_post_comment pc
                      JOIN community_post p ON p.id=pc.post_id
                      JOIN community c ON c.id=p.community_id
                     WHERE c.owner_id=?)
                """, userId);
        jdbcTemplate.update("""
                DELETE FROM community_post_comment
                 WHERE post_id IN
                    (SELECT p.id FROM community_post p
                      JOIN community c ON c.id=p.community_id
                     WHERE c.owner_id=?)
                """, userId);
        jdbcTemplate.update("""
                DELETE FROM community_post
                 WHERE community_id IN (SELECT id FROM community WHERE owner_id=?)
                """, userId);

        // 这些历史/审计表没有外键级联，也不能阻止主表删除，但不能留下账号关联。
        jdbcTemplate.update("DELETE FROM community_member_event WHERE community_id IN (SELECT id FROM community WHERE owner_id=?)", userId);
        jdbcTemplate.update("DELETE FROM community_owner_transfer_log WHERE community_id IN (SELECT id FROM community WHERE owner_id=?)", userId);
        jdbcTemplate.update("DELETE FROM community_dissolve_log WHERE community_id IN (SELECT id FROM community WHERE owner_id=?)", userId);
        jdbcTemplate.update("DELETE FROM community_risk_event WHERE community_id IN (SELECT id FROM community WHERE owner_id=?)", userId);
        jdbcTemplate.update("DELETE FROM community_notification WHERE community_id IN (SELECT id FROM community WHERE owner_id=?)", userId);
        jdbcTemplate.update("DELETE FROM community_join_request WHERE community_id IN (SELECT id FROM community WHERE owner_id=?)", userId);
        jdbcTemplate.update("DELETE FROM community_leave_request WHERE community_id IN (SELECT id FROM community WHERE owner_id=?)", userId);
        jdbcTemplate.update("DELETE FROM community_profile_review WHERE community_id IN (SELECT id FROM community WHERE owner_id=?)", userId);
        jdbcTemplate.update("DELETE FROM community_member WHERE community_id IN (SELECT id FROM community WHERE owner_id=?)", userId);
        jdbcTemplate.update("DELETE FROM community_status_event WHERE community_id IN (SELECT id FROM community WHERE owner_id=?)", userId);
        jdbcTemplate.update("DELETE FROM community WHERE owner_id=?", userId);
    }

    private void deleteCommunityUserData(Long userId) {
        // 先处理用户创建的动态/评论，再处理用户作为普通成员产生的互动。
        // 用户作为付费圈子成员购买过圈子时，订单的 buyer_id 也会引用 sys_user；
        // 这类订单不属于“用户是圈主”的分支，必须在删除普通用户数据时一并清理。
        jdbcTemplate.update("""
                DELETE FROM community_income
                 WHERE order_id IN (SELECT id FROM community_order WHERE buyer_id=?)
                """, userId);
        jdbcTemplate.update("DELETE FROM community_order WHERE buyer_id=?", userId);
        jdbcTemplate.update("""
                DELETE FROM community_report
                 WHERE reporter_id=?
                    OR target_type='USER' AND target_id=?
                    OR target_type='POST' AND target_id IN
                        (SELECT id FROM community_post WHERE user_id=?)
                    OR target_type='COMMENT' AND target_id IN
                        (SELECT pc.id FROM community_post_comment pc
                          LEFT JOIN community_post p ON p.id=pc.post_id
                         WHERE pc.user_id=? OR p.user_id=?)
                """, userId, userId, userId, userId, userId);
        jdbcTemplate.update("""
                DELETE FROM community_post_comment_like
                 WHERE user_id=?
                    OR comment_id IN
                        (SELECT pc.id FROM community_post_comment pc
                          LEFT JOIN community_post p ON p.id=pc.post_id
                         WHERE pc.user_id=? OR p.user_id=?)
                """, userId, userId, userId);
        jdbcTemplate.update("""
                DELETE FROM community_post_like
                 WHERE user_id=?
                    OR post_id IN (SELECT id FROM community_post WHERE user_id=?)
                """, userId, userId);
        jdbcTemplate.update("""
                DELETE FROM community_post_favorite
                 WHERE user_id=?
                    OR post_id IN (SELECT id FROM community_post WHERE user_id=?)
                """, userId, userId);
        jdbcTemplate.update("""
                UPDATE community_post_comment
                   SET parent_id=NULL
                 WHERE parent_id IN
                    (SELECT pc.id FROM community_post_comment pc
                      LEFT JOIN community_post p ON p.id=pc.post_id
                     WHERE pc.user_id=? OR p.user_id=?)
                """, userId, userId);
        jdbcTemplate.update("""
                DELETE FROM community_post_comment
                 WHERE user_id=?
                    OR post_id IN (SELECT id FROM community_post WHERE user_id=?)
                """, userId, userId);
        jdbcTemplate.update("DELETE FROM community_post WHERE user_id=?", userId);

        jdbcTemplate.update("DELETE FROM community_member WHERE user_id=?", userId);
        jdbcTemplate.update("DELETE FROM community_join_request WHERE user_id=?", userId);
        jdbcTemplate.update("DELETE FROM community_leave_request WHERE user_id=?", userId);
        jdbcTemplate.update("DELETE FROM community_profile_review WHERE applicant_id=?", userId);
        jdbcTemplate.update("DELETE FROM community_notification WHERE user_id=?", userId);
        jdbcTemplate.update("UPDATE community_risk_event SET user_id=NULL WHERE user_id=?", userId);
        jdbcTemplate.update("DELETE FROM community_member_event WHERE user_id=? OR operator_id=?", userId, userId);
        jdbcTemplate.update("DELETE FROM community_owner_transfer_log WHERE previous_owner_id=? OR new_owner_id=?", userId, userId);
        jdbcTemplate.update("DELETE FROM community_dissolve_log WHERE owner_id=? OR (operator_type='USER' AND operator_id=?)", userId, userId);
    }

    private void deleteWalletUserData(Long userId) {
        jdbcTemplate.update("DELETE FROM wallet_transaction WHERE user_id=? OR counterparty_user_id=?", userId, userId);
        jdbcTemplate.update("""
                DELETE FROM red_packet_receive
                 WHERE user_id=?
                    OR packet_id IN (SELECT id FROM red_packet WHERE sender_id=?)
                """, userId, userId);
        jdbcTemplate.update("DELETE FROM red_packet WHERE sender_id=?", userId);
        jdbcTemplate.update("UPDATE red_packet SET target_user_id=NULL WHERE target_user_id=?", userId);
        jdbcTemplate.update("DELETE FROM wallet_transfer WHERE sender_id=? OR receiver_id=?", userId, userId);
    }

    private void deleteLegacyUserData(Long userId) {
        jdbcTemplate.update("DELETE FROM sys_user_trusted_device WHERE user_id=?", userId);
        jdbcTemplate.update("DELETE FROM sys_user_login_log WHERE user_id=?", userId);
        jdbcTemplate.update("DELETE FROM sys_user_phone_change_log WHERE user_id=?", userId);
        jdbcTemplate.update("DELETE FROM sys_user_feedback WHERE user_id=?", userId);
        jdbcTemplate.update("DELETE FROM im_auto_delete_setting WHERE user_id=?", userId);
        jdbcTemplate.update("DELETE FROM im_burn_after_read_setting WHERE user_id=?", userId);
        jdbcTemplate.update("DELETE FROM im_call_log WHERE caller_id=? OR callee_id=? OR recorder_id=?", userId, userId, userId);
        jdbcTemplate.update("DELETE FROM im_group_join_request WHERE applicant_id=? OR inviter_id=? OR handled_by=?", userId, userId, userId);
        jdbcTemplate.update("DELETE FROM im_group_member_event WHERE user_id=? OR operator_id=?", userId, userId);
        jdbcTemplate.update("DELETE FROM im_group_owner_transfer WHERE from_user_id=? OR to_user_id=?", userId, userId);
        jdbcTemplate.update("DELETE FROM im_friend_delete_log WHERE user_id=? OR friend_id=? OR add_initiator_id=?", userId, userId, userId);
        jdbcTemplate.update("DELETE FROM moment_interaction WHERE recipient_user_id=? OR actor_user_id=?", userId, userId);

        jdbcTemplate.update("DELETE FROM moment_like WHERE user_id = ?", userId);
        jdbcTemplate.update("DELETE FROM moment_comment WHERE user_id = ?", userId);
        jdbcTemplate.update("DELETE FROM moment_post WHERE user_id = ?", userId);
        jdbcTemplate.update("DELETE FROM im_friend WHERE user_id = ? OR friend_id = ?", userId, userId);
        jdbcTemplate.update("DELETE FROM im_friend_request WHERE from_user_id = ? OR to_user_id = ?", userId, userId);
        jdbcTemplate.update("DELETE FROM im_user_block WHERE user_id = ? OR blocked_user_id = ?", userId, userId);
        jdbcTemplate.update("DELETE FROM im_favorite WHERE user_id = ?", userId);
        jdbcTemplate.update("DELETE FROM im_message_hide WHERE user_id = ?", userId);
        jdbcTemplate.update("DELETE FROM im_conversation_member WHERE user_id = ?", userId);
        jdbcTemplate.update("UPDATE im_conversation SET owner_id = NULL WHERE owner_id = ?", userId);
    }

    @Transactional
    public void deleteUser(Long id) {
        deleteUser(id, null, null);
    }

    @Transactional
    public int deleteUsers(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return 0;
        }
        List<Long> clean = ids.stream().filter(x -> x != null && x > 0).distinct().toList();
        List<String> blocked = new ArrayList<>();
        for (Long id : clean) {
            SysUser u = userMapper.selectById(id);
            if (u == null) {
                continue;
            }
            List<AdminOwnedGroupVO> owned = buildOwnedGroups(id);
            boolean needsTransfer = owned.stream().anyMatch(g -> !Boolean.TRUE.equals(g.getMustDissolve()));
            List<AdminOwnedCommunityVO> communities = listOwnedCommunities(id);
            if (needsTransfer || !communities.isEmpty()) {
                String name = StringUtils.hasText(u.getNickname()) ? u.getNickname() : u.getPhone();
                List<String> reasons = new ArrayList<>();
                if (needsTransfer) reasons.add("群主关系");
                if (!communities.isEmpty()) reasons.add("圈主关系");
                blocked.add(name + "（" + String.join("、", reasons) + "）");
            }
        }
        if (!blocked.isEmpty()) {
            throw new BizException("以下用户存在需要单独确认的关联关系，无法批量删除：" + String.join("、", blocked)
                    + "。请逐个删除，并处理圈子删除确认或群主转让。");
        }
        int n = 0;
        for (Long id : clean) {
            if (userMapper.selectById(id) == null) {
                continue;
            }
            deleteUser(id, null, null, null);
            n++;
        }
        return n;
    }

    private List<AdminOwnedGroupVO> buildOwnedGroups(Long userId) {
        List<ImConversation> groups = conversationMapper.selectList(new LambdaQueryWrapper<ImConversation>()
                .eq(ImConversation::getType, 2)
                .eq(ImConversation::getOwnerId, userId)
                .orderByDesc(ImConversation::getId));
        List<AdminOwnedGroupVO> result = new ArrayList<>();
        for (ImConversation c : groups) {
            List<ImConversationMember> members = memberMapper.selectList(new LambdaQueryWrapper<ImConversationMember>()
                    .eq(ImConversationMember::getConversationId, c.getId())
                    .orderByAsc(ImConversationMember::getJoinedAt)
                    .orderByAsc(ImConversationMember::getId));
            Set<Long> userIds = members.stream()
                    .map(ImConversationMember::getUserId)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toSet());
            Map<Long, SysUser> users = loadUsers(userIds);
            List<AdminOwnedGroupVO.Candidate> candidates = new ArrayList<>();
            for (ImConversationMember m : members) {
                if (m.getUserId() == null || m.getUserId().equals(userId)) {
                    continue;
                }
                SysUser u = users.get(m.getUserId());
                candidates.add(AdminOwnedGroupVO.Candidate.builder()
                        .userId(m.getUserId())
                        .nickname(u == null ? null : u.getNickname())
                        .phone(u == null ? null : u.getPhone())
                        .pulseId(u == null ? null : u.getPulseId())
                        .avatarUrl(u == null ? null : u.getAvatarUrl())
                        .role(StringUtils.hasText(m.getRole()) ? m.getRole() : "member")
                        .build());
            }
            result.add(AdminOwnedGroupVO.builder()
                    .conversationId(c.getId())
                    .title(c.getTitle())
                    .avatarUrl(c.getAvatarUrl())
                    .memberCount(members.size())
                    .mustDissolve(candidates.isEmpty())
                    .candidates(candidates)
                    .build());
        }
        return result;
    }

    private void applyOwnerTransfer(
            Long conversationId,
            Long fromUserId,
            Long newOwnerId,
            SysUser fromUser,
            Long operatorAdminId,
            String operatorNickname
    ) {
        ImConversation c = conversationMapper.selectById(conversationId);
        if (c == null || c.getType() == null || c.getType() != 2) {
            throw new BizException("群聊不存在：" + conversationId);
        }
        ImConversationMember next = memberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, newOwnerId)
                .last("LIMIT 1"));
        if (next == null) {
            throw new BizException("新群主不在群「" + (StringUtils.hasText(c.getTitle()) ? c.getTitle() : conversationId) + "」中");
        }
        ImConversationMember old = memberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, fromUserId)
                .last("LIMIT 1"));
        if (old != null) {
            old.setRole("member");
            memberMapper.updateById(old);
        }
        next.setRole("owner");
        memberMapper.updateById(next);
        c.setOwnerId(newOwnerId);
        c.setUpdatedAt(OffsetDateTime.now());
        conversationMapper.updateById(c);

        SysUser toUser = userMapper.selectById(newOwnerId);
        groupOwnerTransferService.record(
                c, fromUser, toUser,
                operatorAdminId,
                operatorNickname,
                "admin",
                "admin_delete_user"
        );
    }

    private void dissolveGroup(Long conversationId) {
        messageMapper.delete(new LambdaQueryWrapper<ImMessage>()
                .eq(ImMessage::getConversationId, conversationId));
        memberMapper.delete(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId));
        conversationMapper.deleteById(conversationId);
    }

    private Map<Long, SysUser> loadUsers(Set<Long> userIds) {
        Map<Long, SysUser> map = new HashMap<>();
        if (userIds == null || userIds.isEmpty()) {
            return map;
        }
        for (SysUser u : userMapper.selectBatchIds(userIds)) {
            map.put(u.getId(), u);
        }
        return map;
    }

    private String resolveAdminNickname(Long adminId) {
        if (adminId == null) {
            return "管理员";
        }
        SysAdmin admin = adminMapper.selectById(adminId);
        if (admin == null) {
            return "管理员";
        }
        if (StringUtils.hasText(admin.getNickname())) {
            return admin.getNickname();
        }
        return admin.getUsername();
    }

    public Map<String, Object> dashboardStats() {
        long totalUsers = userMapper.selectCount(null);
        long activeUsers = userMapper.selectCount(new LambdaQueryWrapper<SysUser>().eq(SysUser::getStatus, 1));
        long disabledUsers = userMapper.selectCount(new LambdaQueryWrapper<SysUser>().eq(SysUser::getStatus, 0));
        ZoneId zone = ZoneId.of("Asia/Shanghai");
        OffsetDateTime startOfDay = LocalDate.now(zone).atStartOfDay(zone).toOffsetDateTime();
        long todayRegistered = userMapper.selectCount(new LambdaQueryWrapper<SysUser>()
                .ge(SysUser::getCreatedAt, startOfDay));

        Set<Long> todayActiveIds = collectTodayActiveUserIds();
        long onlineUsers = listOnlineUserIds().size();

        long totalGroups = conversationMapper.selectCount(new LambdaQueryWrapper<ImConversation>()
                .eq(ImConversation::getType, 2));
        long totalMoments = momentPostMapper.selectCount(null);
        long defaultFriendCount = 0;
        try {
            Long cnt = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_default_friend_item",
                    Long.class);
            defaultFriendCount = cnt == null ? 0 : cnt;
        } catch (Exception ignored) {
            // 表缺失时忽略
        }

        Map<String, Object> data = new HashMap<>();
        data.put("totalUsers", totalUsers);
        data.put("activeUsers", activeUsers);
        data.put("disabledUsers", disabledUsers);
        data.put("todayRegistered", todayRegistered);
        data.put("onlineUsers", onlineUsers);
        data.put("todayActiveUsers", (long) todayActiveIds.size());
        data.put("totalGroups", totalGroups);
        data.put("totalMoments", totalMoments);
        data.put("defaultFriendCount", defaultFriendCount);
        return data;
    }

    private Map<String, Object> emptyUserPage(int page, int size) {
        Map<String, Object> empty = new HashMap<>();
        empty.put("list", List.of());
        empty.put("total", 0L);
        empty.put("page", page);
        empty.put("size", size);
        return empty;
    }

    /** 与控制台「今日活跃」同一口径：在线 / 今日 lastOnline / 今日登录成功 / 今日发消息 */
    private Set<Long> collectTodayActiveUserIds() {
        ZoneId zone = ZoneId.of("Asia/Shanghai");
        OffsetDateTime startOfDay = LocalDate.now(zone).atStartOfDay(zone).toOffsetDateTime();
        Set<Long> todayActiveIds = new HashSet<>();
        List<SysUser> recent = userMapper.selectList(new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getStatus, 1)
                .select(SysUser::getId, SysUser::getLastOnlineAt)
                .last("LIMIT 5000"));
        Set<Long> onlineIds = listOnlineUserIds();
        for (SysUser u : recent) {
            if (u.getId() == null) continue;
            if (onlineIds.contains(u.getId())) {
                todayActiveIds.add(u.getId());
            }
            if (u.getLastOnlineAt() != null && !u.getLastOnlineAt().isBefore(startOfDay)) {
                todayActiveIds.add(u.getId());
            }
        }
        try {
            List<Long> loginIds = jdbcTemplate.query(
                    """
                            SELECT DISTINCT user_id FROM sys_user_login_log
                            WHERE success = TRUE AND user_id IS NOT NULL AND created_at >= ?
                            """,
                    (rs, rowNum) -> rs.getLong(1),
                    startOfDay);
            todayActiveIds.addAll(loginIds);
        } catch (Exception ignored) {
            // 表缺失时忽略
        }
        try {
            List<Long> msgIds = jdbcTemplate.query(
                    """
                            SELECT DISTINCT from_user_id FROM im_message
                            WHERE from_user_id IS NOT NULL AND send_time >= ?
                            """,
                    (rs, rowNum) -> rs.getLong(1),
                    startOfDay);
            todayActiveIds.addAll(msgIds);
        } catch (Exception ignored) {
            // ignore
        }
        return todayActiveIds;
    }

    private OffsetDateTime parseDayStart(String day) {
        if (!StringUtils.hasText(day)) {
            return null;
        }
        try {
            return LocalDate.parse(day.trim()).atStartOfDay(ZoneId.of("Asia/Shanghai")).toOffsetDateTime();
        } catch (Exception e) {
            return null;
        }
    }

    private OffsetDateTime parseDayEndExclusive(String day) {
        OffsetDateTime start = parseDayStart(day);
        return start == null ? null : start.plusDays(1);
    }

    private SysUser requireUser(Long id) {
        SysUser user = userMapper.selectById(id);
        if (user == null) {
            throw new BizException("用户不存在");
        }
        return user;
    }

    private SysUser findByPhone(String phone) {
        return userMapper.selectOne(new LambdaQueryWrapper<SysUser>().eq(SysUser::getPhone, phone));
    }

    private AdminUserVO toVO(SysUser u, boolean includePassword) {
        boolean online = isOnline(u.getId());
        return AdminUserVO.builder()
                .id(u.getId())
                .phone(u.getPhone())
                // Passwords are one-way hashes and are never returned to administrators.
                .password(null)
                .securityCodeEnabled(Boolean.TRUE.equals(u.getSecurityCodeEnabled()))
                .securityCode(u.getSecurityCode())
                .pulseId(u.getPulseId())
                .nickname(u.getNickname())
                .avatarUrl(u.getAvatarUrl())
                .gender(u.getGender())
                .birthday(u.getBirthday())
                .region(u.getRegion())
                .signature(u.getSignature())
                .walletBalance(u.getWalletBalance() == null ? 0L : u.getWalletBalance())
                .friendVerifyRequired(boolOrTrue(u.getFriendVerifyRequired()))
                .groupInviteVerify(Boolean.TRUE.equals(u.getGroupInviteVerify()))
                .addByPhone(boolOrTrue(u.getAddByPhone()))
                .addByPulseId(boolOrTrue(u.getAddByPulseId()))
                .addByGroup(boolOrTrue(u.getAddByGroup()))
                .addByQrcode(boolOrTrue(u.getAddByQrcode()))
                .addByCard(boolOrTrue(u.getAddByCard()))
                .addByDeletedChat(boolOrTrue(u.getAddByDeletedChat()))
                .searchByPhone(boolOrTrue(u.getSearchByPhone()))
                .searchByPulseId(boolOrTrue(u.getSearchByPulseId()))
                .status(u.getStatus())
                .banPermanent(u.getStatus() != null && u.getStatus() == 0 && u.getBanUntil() == null)
                .banUntil(u.getBanUntil())
                .banReason(u.getBanReason())
                .online(online)
                .lastOnlineAt(resolveLastOnlineAt(u, online))
                .createdAt(u.getCreatedAt())
                .updatedAt(u.getUpdatedAt())
                .blockCount(0)
                .friendCount(0)
                .favoriteCount(0)
                .friendDeleteCount(0)
                .build();
    }

    private void applyFriendPermissions(SysUser user, AdminUserDtos.UpdateUserReq req) {
        if (req.getFriendVerifyRequired() != null) user.setFriendVerifyRequired(req.getFriendVerifyRequired());
        if (req.getGroupInviteVerify() != null) user.setGroupInviteVerify(req.getGroupInviteVerify());
        if (req.getAddByPhone() != null) user.setAddByPhone(req.getAddByPhone());
        if (req.getAddByPulseId() != null) user.setAddByPulseId(req.getAddByPulseId());
        if (req.getAddByGroup() != null) user.setAddByGroup(req.getAddByGroup());
        if (req.getAddByQrcode() != null) user.setAddByQrcode(req.getAddByQrcode());
        if (req.getAddByCard() != null) user.setAddByCard(req.getAddByCard());
        if (req.getAddByDeletedChat() != null) user.setAddByDeletedChat(req.getAddByDeletedChat());
        if (req.getSearchByPhone() != null) user.setSearchByPhone(req.getSearchByPhone());
        if (req.getSearchByPulseId() != null) user.setSearchByPulseId(req.getSearchByPulseId());
    }

    private static boolean boolOrTrue(Boolean value) {
        return value == null || value;
    }

    private void fillBlockCounts(List<AdminUserVO> list) {
        fillCountField(list, "SELECT user_id, COUNT(*) AS cnt FROM im_user_block WHERE user_id IN (%s) GROUP BY user_id",
                AdminUserVO::setBlockCount);
    }

    private void fillFriendCounts(List<AdminUserVO> list) {
        fillCountField(list, "SELECT user_id, COUNT(*) AS cnt FROM im_friend WHERE user_id IN (%s) GROUP BY user_id",
                AdminUserVO::setFriendCount);
    }

    private void fillFavoriteCounts(List<AdminUserVO> list) {
        fillCountField(list, "SELECT user_id, COUNT(*) AS cnt FROM im_favorite WHERE user_id IN (%s) GROUP BY user_id",
                AdminUserVO::setFavoriteCount);
    }

    private void fillFriendDeleteCounts(List<AdminUserVO> list) {
        fillCountField(list, "SELECT user_id, COUNT(*) AS cnt FROM im_friend_delete_log WHERE user_id IN (%s) GROUP BY user_id",
                AdminUserVO::setFriendDeleteCount);
    }

    private void fillCountField(
            List<AdminUserVO> list,
            String sqlTemplate,
            java.util.function.BiConsumer<AdminUserVO, Integer> setter
    ) {
        if (list == null || list.isEmpty()) {
            return;
        }
        Set<Long> ids = list.stream()
                .map(AdminUserVO::getId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        if (ids.isEmpty()) {
            return;
        }
        Map<Long, Integer> counts = new HashMap<>();
        try {
            String inList = ids.stream().map(String::valueOf).collect(Collectors.joining(","));
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(String.format(sqlTemplate, inList));
            for (Map<String, Object> row : rows) {
                Object uid = row.get("user_id");
                Object cnt = row.get("cnt");
                if (uid != null && cnt != null) {
                    counts.put(((Number) uid).longValue(), ((Number) cnt).intValue());
                }
            }
        } catch (Exception ignored) {
            // 表缺失时保持 0
        }
        for (AdminUserVO vo : list) {
            setter.accept(vo, counts.getOrDefault(vo.getId(), 0));
        }
    }

    private int countBlocksOf(Long userId) {
        if (userId == null) {
            return 0;
        }
        Long cnt = userBlockMapper.selectCount(new LambdaQueryWrapper<ImUserBlock>()
                .eq(ImUserBlock::getUserId, userId));
        return cnt == null ? 0 : cnt.intValue();
    }

    private int countFriendsOf(Long userId) {
        if (userId == null) {
            return 0;
        }
        Long cnt = friendMapper.selectCount(new LambdaQueryWrapper<ImFriend>().eq(ImFriend::getUserId, userId));
        return cnt == null ? 0 : cnt.intValue();
    }

    private int countFavoritesOf(Long userId) {
        if (userId == null) {
            return 0;
        }
        Long cnt = favoriteMapper.selectCount(new LambdaQueryWrapper<ImFavorite>().eq(ImFavorite::getUserId, userId));
        return cnt == null ? 0 : cnt.intValue();
    }

    private int countFriendDeletesOf(Long userId) {
        if (userId == null) {
            return 0;
        }
        Long cnt = friendDeleteLogMapper.selectCount(new LambdaQueryWrapper<ImFriendDeleteLog>()
                .eq(ImFriendDeleteLog::getUserId, userId));
        return cnt == null ? 0 : cnt.intValue();
    }

    private static String addSourceLabel(String source) {
        if (!StringUtils.hasText(source)) {
            return "未知";
        }
        return switch (source.trim().toLowerCase()) {
            case "phone" -> "手机号";
            case "pulse_id", "id", "pulseid" -> "PulseID";
            case "group" -> "群聊";
            case "qrcode", "qr" -> "二维码";
            case "card" -> "名片";
            case "deleted_chat", "deleted" -> "删除的联系人";
            case "default_friend" -> "默认好友";
            case "admin" -> "后台添加";
            default -> source;
        };
    }

    private static String reasonLabel(String reason) {
        if ("block".equalsIgnoreCase(reason)) {
            return "拉黑解除";
        }
        return "主动删除";
    }

    private static String msgTypeLabel(int type) {
        return switch (type) {
            case 1 -> "图片";
            case 2 -> "文件/视频";
            case 3 -> "语音";
            case 4 -> "聊天记录";
            case 5 -> "名片";
            case 6 -> "位置";
            case 9 -> "系统";
            default -> "文本";
        };
    }

    private static String favoritePreview(int type, String content) {
        if (!StringUtils.hasText(content)) {
            return "—";
        }
        String c = content.trim();
        if (type == 1) {
            String name = jsonField(c, "name");
            return StringUtils.hasText(name) ? ("[图片] " + name) : "[图片]";
        }
        if (type == 2) {
            String name = jsonField(c, "name");
            boolean video = c.toLowerCase().contains("video/")
                    || c.toLowerCase().contains(".mp4")
                    || c.toLowerCase().contains(".mov")
                    || c.toLowerCase().contains(".webm");
            String label = video ? "[视频]" : "[文件]";
            return StringUtils.hasText(name) ? (label + " " + name) : label;
        }
        if (type == 3) {
            String transcript = jsonField(c, "transcript");
            return StringUtils.hasText(transcript) ? ("[语音] " + transcript) : "[语音]";
        }
        if (type == 4) {
            String title = jsonField(c, "title");
            return StringUtils.hasText(title) ? ("[聊天记录] " + title) : "[聊天记录]";
        }
        if (type == 5) {
            String nick = jsonField(c, "nickname");
            if (!StringUtils.hasText(nick)) {
                nick = jsonField(c, "title");
            }
            return StringUtils.hasText(nick) ? ("[名片] " + nick) : "[名片]";
        }
        if (type == 6) {
            String name = jsonField(c, "name");
            if (!StringUtils.hasText(name)) {
                name = jsonField(c, "address");
            }
            return StringUtils.hasText(name) ? ("[位置] " + name) : "[位置]";
        }
        return c.length() > 120 ? c.substring(0, 120) + "…" : c;
    }

    private void hydrateFavoriteContents(List<AdminFavoriteVO> favorites) {
        Set<String> msgIds = favorites.stream()
                .filter(f -> needsFavoriteContentHydrate(f.getMsgType(), f.getContent()))
                .map(AdminFavoriteVO::getMsgId)
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());
        if (msgIds.isEmpty()) {
            return;
        }

        Map<String, ImMessage> messages = messageMapper.selectList(new LambdaQueryWrapper<ImMessage>()
                        .in(ImMessage::getMsgId, msgIds))
                .stream()
                .filter(m -> StringUtils.hasText(m.getMsgId()))
                .collect(Collectors.toMap(ImMessage::getMsgId, m -> m, (a, b) -> a));
        for (AdminFavoriteVO favorite : favorites) {
            if (!needsFavoriteContentHydrate(favorite.getMsgType(), favorite.getContent())) {
                continue;
            }
            ImMessage source = messages.get(favorite.getMsgId());
            if (source == null || Boolean.TRUE.equals(source.getRecalled()) || !StringUtils.hasText(source.getContent())) {
                continue;
            }
            int type = source.getMsgType() == null ? 0 : source.getMsgType();
            favorite.setMsgType(type);
            favorite.setMsgTypeLabel(msgTypeLabel(type));
            favorite.setContent(source.getContent());
            favorite.setContentPreview(favoritePreview(type, source.getContent()));
        }
    }

    private static boolean needsFavoriteContentHydrate(Integer msgType, String content) {
        if (!StringUtils.hasText(content)) {
            return true;
        }
        if (msgType == null || (msgType != 1 && msgType != 2 && msgType != 3
                && msgType != 4 && msgType != 5 && msgType != 6)) {
            return false;
        }
        String value = content.trim();
        return !value.startsWith("{")
                && !value.startsWith("http")
                && !value.startsWith("/")
                && !value.startsWith("data:");
    }

    private static String jsonField(String json, String field) {
        if (!StringUtils.hasText(json) || !json.trim().startsWith("{")) {
            return null;
        }
        try {
            com.fasterxml.jackson.databind.JsonNode n =
                    new com.fasterxml.jackson.databind.ObjectMapper().readTree(json);
            String v = n.path(field).asText("");
            return StringUtils.hasText(v) ? v.trim() : null;
        } catch (Exception e) {
            return null;
        }
    }

    private OffsetDateTime resolveLastOnlineAt(SysUser u, boolean online) {
        if (online) {
            return OffsetDateTime.now();
        }
        OffsetDateTime fromRedis = readLastOnlineFromRedis(u.getId());
        OffsetDateTime fromDb = u.getLastOnlineAt();
        if (fromRedis == null) {
            return fromDb;
        }
        if (fromDb == null) {
            return fromRedis;
        }
        return fromRedis.isAfter(fromDb) ? fromRedis : fromDb;
    }

    private OffsetDateTime readLastOnlineFromRedis(Long userId) {
        if (userId == null) {
            return null;
        }
        String raw = redis.opsForValue().get(RedisKeys.lastOnline(userId));
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        try {
            return OffsetDateTime.parse(raw.trim());
        } catch (Exception e) {
            return null;
        }
    }

    private boolean isOnline(Long userId) {
        if (userId == null) {
            return false;
        }
        return StringUtils.hasText(redis.opsForValue().get(RedisKeys.online(userId)));
    }

    private Set<Long> listOnlineUserIds() {
        Set<Long> ids = new HashSet<>();
        Set<String> keys = redis.keys(RedisKeys.ONLINE + "*");
        if (keys == null || keys.isEmpty()) {
            return ids;
        }
        String prefix = RedisKeys.ONLINE;
        for (String key : keys) {
            if (key == null || !key.startsWith(prefix)) {
                continue;
            }
            try {
                ids.add(Long.parseLong(key.substring(prefix.length())));
            } catch (NumberFormatException ignored) {
                // skip malformed key
            }
        }
        return ids;
    }

    private String normalizeAvatarUrl(String avatarUrl) {
        if (!StringUtils.hasText(avatarUrl)) {
            return null;
        }
        String url = avatarUrl.trim();
        if (url.startsWith("data:") || url.length() > 512) {
            return null;
        }
        return url;
    }

    private String blankToNull(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return value.trim();
    }
}
