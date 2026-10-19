package com.pulse.api.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.pulse.api.entity.ImConversation;
import com.pulse.api.entity.ImConversationMember;
import com.pulse.api.entity.ImGroupMemberEvent;
import com.pulse.api.entity.ImMessage;
import com.pulse.api.entity.SysAdmin;
import com.pulse.api.entity.SysUser;
import com.pulse.api.mapper.ImConversationMapper;
import com.pulse.api.mapper.ImConversationMemberMapper;
import com.pulse.api.mapper.ImGroupMemberEventMapper;
import com.pulse.api.mapper.ImMessageMapper;
import com.pulse.api.mapper.SysAdminMapper;
import com.pulse.api.mapper.SysUserMapper;
import com.pulse.api.vo.AdminGroupVO;
import com.pulse.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AdminGroupService {
    private final ImConversationMapper conversationMapper;
    private final ImConversationMemberMapper memberMapper;
    private final ImMessageMapper messageMapper;
    private final ImGroupMemberEventMapper groupMemberEventMapper;
    private final SysUserMapper userMapper;
    private final SysAdminMapper adminMapper;
    private final JdbcTemplate jdbcTemplate;
    private final GroupOwnerTransferService groupOwnerTransferService;
    private final GroupMemberEventService groupMemberEventService;
    private final ConversationService conversationService;

    public Map<String, Object> listGroups(int page, int size, String keyword) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);

        LambdaQueryWrapper<ImConversation> qw = new LambdaQueryWrapper<ImConversation>()
                .eq(ImConversation::getType, 2);
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            qw.and(w -> w.like(ImConversation::getTitle, kw)
                    .or().like(ImConversation::getNotice, kw)
                    .or().apply("CAST(id AS TEXT) LIKE {0}", "%" + kw + "%")
                    .or().apply("LPAD(CAST(id AS TEXT), 8, '0') LIKE {0}", "%" + kw + "%"));
        }
        qw.orderByDesc(ImConversation::getLastMsgTime).orderByDesc(ImConversation::getId);

        Page<ImConversation> result = conversationMapper.selectPage(new Page<>(safePage, safeSize), qw);
        List<ImConversation> records = result.getRecords();
        Map<Long, Integer> memberCounts = loadMemberCounts(records);
        Map<Long, SysUser> owners = loadOwners(records);

        List<AdminGroupVO> list = records.stream()
                .map(c -> toListVO(c, memberCounts, owners))
                .collect(Collectors.toList());

        Map<String, Object> data = new HashMap<>();
        data.put("list", list);
        data.put("total", result.getTotal());
        data.put("page", safePage);
        data.put("size", safeSize);
        return data;
    }

    /** 后台新建群聊：指定群主与初始成员 */
    @Transactional
    public AdminGroupVO createGroup(String title, Long ownerId, List<Long> memberIds, String notice) {
        if (!StringUtils.hasText(title)) {
            throw new BizException("请输入群名称");
        }
        if (ownerId == null) {
            throw new BizException("请选择群主");
        }
        SysUser owner = userMapper.selectById(ownerId);
        if (owner == null) {
            throw new BizException("群主用户不存在");
        }
        List<Long> members = memberIds == null ? List.of() : memberIds;
        for (Long mid : members) {
            if (mid == null || mid.equals(ownerId)) {
                continue;
            }
            SysUser u = userMapper.selectById(mid);
            if (u == null) {
                throw new BizException("成员用户不存在：" + mid);
            }
        }
        var created = conversationService.createGroup(ownerId, title.trim(), members);
        if (created.getId() == null) {
            throw new BizException("创建群聊失败");
        }
        if (StringUtils.hasText(notice)) {
            ImConversation c = conversationMapper.selectById(created.getId());
            if (c != null) {
                c.setNotice(notice.trim());
                c.setUpdatedAt(OffsetDateTime.now());
                conversationMapper.updateById(c);
            }
        }
        return getGroup(created.getId());
    }

    public AdminGroupVO getGroup(Long id) {
        ImConversation c = requireGroup(id);
        Long ownerId = resolveOwnerId(c);
        SysUser owner = ownerId == null ? null : userMapper.selectById(ownerId);
        SysUser welcomeSetter = c.getGroupWelcomeSetterId() == null ? null : userMapper.selectById(c.getGroupWelcomeSetterId());
        Long memberCount = memberMapper.selectCount(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, id));

        List<ImConversationMember> members = memberMapper.selectList(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, id)
                .orderByAsc(ImConversationMember::getJoinedAt)
                .orderByAsc(ImConversationMember::getId));

        Set<Long> userIds = members.stream()
                .map(ImConversationMember::getUserId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<Long, SysUser> users = loadUsers(userIds);

        List<AdminGroupVO.Member> memberVOs = new ArrayList<>();
        for (ImConversationMember m : members) {
            SysUser u = users.get(m.getUserId());
            memberVOs.add(AdminGroupVO.Member.builder()
                    .userId(m.getUserId())
                    .nickname(u == null ? null : u.getNickname())
                    .phone(u == null ? null : u.getPhone())
                    .pulseId(u == null ? null : u.getPulseId())
                    .avatarUrl(u == null ? null : u.getAvatarUrl())
                    .role(StringUtils.hasText(m.getRole()) ? m.getRole() : "member")
                    .speakMuted(Boolean.TRUE.equals(m.getSpeakMuted()))
                    .joinSource(StringUtils.hasText(m.getJoinSource()) ? m.getJoinSource() : "unknown")
                    .joinedAt(m.getJoinedAt())
                    .build());
        }

        List<AdminGroupVO.CreateRecord> createRecords = loadCreateRecords(id, c, memberVOs, users);

        return AdminGroupVO.builder()
                .id(c.getId())
                .pulseId(conversationService.groupPulseId(c))
                .title(c.getTitle())
                .avatarUrl(c.getAvatarUrl())
                .ownerId(ownerId)
                .ownerNickname(owner == null ? null : owner.getNickname())
                .ownerPhone(owner == null ? null : owner.getPhone())
                .memberCount(memberCount == null ? 0 : memberCount.intValue())
                .muteAll(Boolean.TRUE.equals(c.getMuteAll()))
                .joinVerifyRequired(Boolean.TRUE.equals(c.getJoinVerifyRequired()))
                .notice(c.getNotice())
                .welcomeMessage(c.getGroupWelcomeMessage())
                .welcomeSetterId(c.getGroupWelcomeSetterId())
                .welcomeSetterNickname(welcomeSetter == null ? null : welcomeSetter.getNickname())
                .welcomeSetterAvatarUrl(welcomeSetter == null ? null : welcomeSetter.getAvatarUrl())
                .lastMsgPreview(c.getLastMsgPreview())
                .lastMsgTime(c.getLastMsgTime())
                .createdAt(c.getCreatedAt())
                .updatedAt(c.getUpdatedAt())
                .members(memberVOs)
                .createRecords(createRecords)
                .build();
    }

    /** 建群记录：优先出入事件，缺失时回退到成员入群来源 */
    private List<AdminGroupVO.CreateRecord> loadCreateRecords(
            Long conversationId,
            ImConversation group,
            List<AdminGroupVO.Member> members,
            Map<Long, SysUser> users
    ) {
        List<ImGroupMemberEvent> events = groupMemberEventMapper.selectList(new LambdaQueryWrapper<ImGroupMemberEvent>()
                .eq(ImGroupMemberEvent::getConversationId, conversationId)
                .and(w -> w.in(ImGroupMemberEvent::getSource, "create", "create_invite")
                        .or().eq(ImGroupMemberEvent::getReason, "创建群聊")
                        .or().eq(ImGroupMemberEvent::getReason, "建群时加入"))
                .orderByAsc(ImGroupMemberEvent::getId));
        if (!events.isEmpty()) {
            List<AdminGroupVO.CreateRecord> out = new ArrayList<>();
            for (ImGroupMemberEvent e : events) {
                SysUser u = e.getUserId() == null ? null : users.get(e.getUserId());
                if (u == null && e.getUserId() != null) {
                    u = userMapper.selectById(e.getUserId());
                }
                String source = StringUtils.hasText(e.getSource()) ? e.getSource() : "create";
                out.add(AdminGroupVO.CreateRecord.builder()
                        .userId(e.getUserId())
                        .nickname(u != null && StringUtils.hasText(u.getNickname()) ? u.getNickname() : e.getUserNickname())
                        .phone(u != null && StringUtils.hasText(u.getPhone()) ? u.getPhone() : e.getUserPhone())
                        .pulseId(u == null ? null : u.getPulseId())
                        .avatarUrl(u == null ? null : u.getAvatarUrl())
                        .source(source)
                        .sourceLabel(createSourceLabel(source))
                        .reason(e.getReason())
                        .operatorId(e.getOperatorId())
                        .operatorNickname(e.getOperatorNickname())
                        .createdAt(e.getCreatedAt() != null ? e.getCreatedAt() : group.getCreatedAt())
                        .build());
            }
            return out;
        }

        List<AdminGroupVO.CreateRecord> fallback = new ArrayList<>();
        for (AdminGroupVO.Member m : members) {
            String source = m.getJoinSource();
            if (!"create".equals(source) && !"create_invite".equals(source)) {
                continue;
            }
            fallback.add(AdminGroupVO.CreateRecord.builder()
                    .userId(m.getUserId())
                    .nickname(m.getNickname())
                    .phone(m.getPhone())
                    .pulseId(m.getPulseId())
                    .avatarUrl(m.getAvatarUrl())
                    .source(source)
                    .sourceLabel(createSourceLabel(source))
                    .reason("create".equals(source) ? "创建群聊" : "建群时加入")
                    .operatorId(group.getOwnerId())
                    .operatorNickname(null)
                    .createdAt(m.getJoinedAt() != null ? m.getJoinedAt() : group.getCreatedAt())
                    .build());
        }
        if (fallback.isEmpty() && group.getOwnerId() != null) {
            SysUser owner = users.get(group.getOwnerId());
            if (owner == null) {
                owner = userMapper.selectById(group.getOwnerId());
            }
            fallback.add(AdminGroupVO.CreateRecord.builder()
                    .userId(group.getOwnerId())
                    .nickname(owner == null ? null : owner.getNickname())
                    .phone(owner == null ? null : owner.getPhone())
                    .pulseId(owner == null ? null : owner.getPulseId())
                    .avatarUrl(owner == null ? null : owner.getAvatarUrl())
                    .source("create")
                    .sourceLabel(createSourceLabel("create"))
                    .reason("创建群聊")
                    .operatorId(group.getOwnerId())
                    .operatorNickname(owner == null ? null : owner.getNickname())
                    .createdAt(group.getCreatedAt())
                    .build());
        }
        return fallback;
    }

    private String createSourceLabel(String source) {
        if ("create".equals(source)) {
            return "创建群聊";
        }
        if ("create_invite".equals(source)) {
            return "建群时加入";
        }
        return "建群";
    }

    @Transactional
    public void dissolveGroup(Long id) {
        ImConversation group = requireGroup(id);
        List<ImConversationMember> members = memberMapper.selectList(
                new LambdaQueryWrapper<ImConversationMember>()
                        .eq(ImConversationMember::getConversationId, id));
        SysUser owner = group.getOwnerId() == null ? null : userMapper.selectById(group.getOwnerId());
        if (owner == null && !members.isEmpty()) {
            owner = userMapper.selectById(members.get(0).getUserId());
        }
        if (owner != null) {
            groupMemberEventService.record(
                    group, owner, null, "group_dissolve", "admin", null,
                    "后台管理员解散群聊，解散时成员数：" + members.size(), null);
        }
        for (ImConversationMember member : members) {
            SysUser affected = userMapper.selectById(member.getUserId());
            if (affected != null) {
                groupMemberEventService.record(
                        group, affected, null, "dissolve", "admin", null,
                        "群聊已被后台管理员解散", null);
            }
        }
        messageMapper.delete(new LambdaQueryWrapper<ImMessage>()
                .eq(ImMessage::getConversationId, id));
        memberMapper.delete(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, id));
        conversationMapper.deleteById(id);
    }

    @Transactional
    public AdminGroupVO transferOwner(Long conversationId, Long newOwnerId, Long operatorAdminId) {
        ImConversation c = requireGroup(conversationId);
        if (newOwnerId == null) {
            throw new BizException("请选择新的群主");
        }
        Long currentOwnerId = resolveOwnerId(c);
        if (currentOwnerId != null && currentOwnerId.equals(newOwnerId)) {
            throw new BizException("该成员已是群主");
        }
        ImConversationMember next = memberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, newOwnerId)
                .last("LIMIT 1"));
        if (next == null) {
            throw new BizException("对方不在群中");
        }

        if (currentOwnerId != null) {
            ImConversationMember old = memberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                    .eq(ImConversationMember::getConversationId, conversationId)
                    .eq(ImConversationMember::getUserId, currentOwnerId)
                    .last("LIMIT 1"));
            if (old != null) {
                old.setRole("member");
                memberMapper.updateById(old);
            }
        }
        next.setRole("owner");
        memberMapper.updateById(next);
        c.setOwnerId(newOwnerId);
        c.setUpdatedAt(OffsetDateTime.now());
        conversationMapper.updateById(c);

        SysUser fromUser = currentOwnerId == null ? null : userMapper.selectById(currentOwnerId);
        SysUser toUser = userMapper.selectById(newOwnerId);
        if (fromUser == null) {
            fromUser = new SysUser();
            fromUser.setId(0L);
            fromUser.setNickname("未知");
        }
        groupOwnerTransferService.record(
                c, fromUser, toUser,
                operatorAdminId,
                resolveAdminNickname(operatorAdminId),
                "admin",
                "admin_transfer"
        );
        String name = toUser != null && StringUtils.hasText(toUser.getNickname())
                ? toUser.getNickname()
                : ("用户" + newOwnerId);
        Long tipFrom = currentOwnerId != null ? currentOwnerId : newOwnerId;
        conversationService.postGroupSystemTip(tipFrom, conversationId, "「" + name + "」已成为新群主");
        return getGroup(conversationId);
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

    @Transactional
    public int dissolveGroups(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return 0;
        }
        int n = 0;
        for (Long id : ids.stream().filter(x -> x != null && x > 0).distinct().toList()) {
            dissolveGroup(id);
            n++;
        }
        return n;
    }

    private AdminGroupVO toListVO(
            ImConversation c,
            Map<Long, Integer> memberCounts,
            Map<Long, SysUser> owners
    ) {
        Long ownerId = c.getOwnerId();
        SysUser owner = ownerId == null ? null : owners.get(ownerId);
        return AdminGroupVO.builder()
                .id(c.getId())
                .pulseId(conversationService.groupPulseId(c))
                .title(c.getTitle())
                .avatarUrl(c.getAvatarUrl())
                .ownerId(ownerId)
                .ownerNickname(owner == null ? null : owner.getNickname())
                .ownerPhone(owner == null ? null : owner.getPhone())
                .memberCount(memberCounts.getOrDefault(c.getId(), 0))
                .muteAll(Boolean.TRUE.equals(c.getMuteAll()))
                .joinVerifyRequired(Boolean.TRUE.equals(c.getJoinVerifyRequired()))
                .notice(c.getNotice())
                .lastMsgPreview(c.getLastMsgPreview())
                .lastMsgTime(c.getLastMsgTime())
                .createdAt(c.getCreatedAt())
                .updatedAt(c.getUpdatedAt())
                .build();
    }

    private Map<Long, Integer> loadMemberCounts(List<ImConversation> records) {
        if (records == null || records.isEmpty()) {
            return Collections.emptyMap();
        }
        List<Long> ids = records.stream().map(ImConversation::getId).filter(Objects::nonNull).toList();
        if (ids.isEmpty()) {
            return Collections.emptyMap();
        }
        String placeholders = ids.stream().map(i -> "?").collect(Collectors.joining(","));
        String sql = "SELECT conversation_id, COUNT(*) AS cnt FROM im_conversation_member "
                + "WHERE conversation_id IN (" + placeholders + ") GROUP BY conversation_id";
        Map<Long, Integer> map = new HashMap<>();
        jdbcTemplate.query(sql, rs -> {
            map.put(rs.getLong("conversation_id"), rs.getInt("cnt"));
        }, ids.toArray());
        return map;
    }

    private Map<Long, SysUser> loadOwners(List<ImConversation> records) {
        Set<Long> ownerIds = new HashSet<>();
        for (ImConversation c : records) {
            if (c.getOwnerId() != null) {
                ownerIds.add(c.getOwnerId());
            }
        }
        return loadUsers(ownerIds);
    }

    private Map<Long, SysUser> loadUsers(Set<Long> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return Collections.emptyMap();
        }
        List<SysUser> users = userMapper.selectBatchIds(userIds);
        Map<Long, SysUser> map = new HashMap<>();
        for (SysUser u : users) {
            map.put(u.getId(), u);
        }
        return map;
    }

    private ImConversation requireGroup(Long id) {
        ImConversation c = conversationMapper.selectById(id);
        if (c == null || c.getType() == null || c.getType() != 2) {
            throw new BizException("群聊不存在");
        }
        return c;
    }

    private Long resolveOwnerId(ImConversation c) {
        if (c.getOwnerId() != null) {
            return c.getOwnerId();
        }
        List<ImConversationMember> ordered = memberMapper.selectList(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, c.getId())
                .orderByAsc(ImConversationMember::getJoinedAt)
                .orderByAsc(ImConversationMember::getId)
                .last("LIMIT 1"));
        if (ordered.isEmpty()) {
            return null;
        }
        return ordered.get(0).getUserId();
    }
}
