package com.pulse.api.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.pulse.api.entity.ImConversation;
import com.pulse.api.entity.ImConversationMember;
import com.pulse.api.entity.ImFavorite;
import com.pulse.api.entity.ImFriend;
import com.pulse.api.entity.ImFriendDeleteLog;
import com.pulse.api.entity.ImFriendRequest;
import com.pulse.api.entity.ImMessage;
import com.pulse.api.entity.ImFile;
import com.pulse.api.entity.ImMessageHide;
import com.pulse.api.entity.ImUserBlock;
import com.pulse.api.entity.MomentComment;
import com.pulse.api.entity.MomentInteraction;
import com.pulse.api.entity.MomentLike;
import com.pulse.api.entity.MomentPost;
import com.pulse.api.entity.SysUser;
import com.pulse.api.mapper.ImConversationMapper;
import com.pulse.api.mapper.ImConversationMemberMapper;
import com.pulse.api.mapper.ImFavoriteMapper;
import com.pulse.api.mapper.ImFriendDeleteLogMapper;
import com.pulse.api.mapper.ImFriendMapper;
import com.pulse.api.mapper.ImFriendRequestMapper;
import com.pulse.api.mapper.ImMessageHideMapper;
import com.pulse.api.mapper.ImMessageMapper;
import com.pulse.api.mapper.ImFileMapper;
import com.pulse.api.mapper.ImUserBlockMapper;
import com.pulse.api.mapper.MomentCommentMapper;
import com.pulse.api.mapper.MomentInteractionMapper;
import com.pulse.api.mapper.MomentLikeMapper;
import com.pulse.api.mapper.MomentPostMapper;
import com.pulse.api.mapper.SysUserMapper;
import com.pulse.api.security.AuthContext;
import com.pulse.api.support.UserIdentityAllocator;
import com.pulse.api.vo.CommonGroupVO;
import com.pulse.api.vo.ContactVO;
import com.pulse.api.vo.ConversationVO;
import com.pulse.api.vo.FavoriteVO;
import com.pulse.api.vo.FriendRequestVO;
import com.pulse.api.vo.MessageVO;
import com.pulse.api.vo.FileMetadataVO;
import com.pulse.api.vo.MomentCommentVO;
import com.pulse.api.vo.MomentInteractionVO;
import com.pulse.api.vo.MomentVO;
import com.pulse.api.vo.MomentsUpdateVO;
import com.pulse.api.vo.PrivacySettingsVO;
import com.pulse.api.vo.UserProfileVO;
import com.pulse.common.constant.RedisKeys;
import com.pulse.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class SocialService {
    private final ImFriendMapper friendMapper;
    private final ImFriendRequestMapper friendRequestMapper;
    private final ImFriendDeleteLogMapper friendDeleteLogMapper;
    private final SysUserMapper userMapper;
    private final UserIdentityAllocator identityAllocator;
    private final ImMessageMapper messageMapper;
    private final ImFileMapper fileMapper;
    private final ImMessageHideMapper messageHideMapper;
    private final ImFavoriteMapper favoriteMapper;
    private final MomentPostMapper momentPostMapper;
    private final MomentLikeMapper momentLikeMapper;
    private final MomentCommentMapper momentCommentMapper;
    private final MomentInteractionMapper momentInteractionMapper;
    private final ImConversationMapper conversationMapper;
    private final ImConversationMemberMapper memberMapper;
    private final ImUserBlockMapper userBlockMapper;
    private final ConversationService conversationService;
    private final FileTransferAssistantService fileTransferAssistantService;
    private final CallLogService callLogService;
    private final BurnAfterReadService burnAfterReadService;
    private final AutoDeleteMessageService autoDeleteMessageService;
    private final DefaultFriendService defaultFriendService;
    private final SensitiveWordService sensitiveWordService;
    private final NicknameConfigService nicknameConfigService;
    private final DisplayNameService displayNameService;
    private final StringRedisTemplate redis;
    private final JdbcTemplate jdbc;
    private final ChatFileStorageService chatFileStorageService;

    public void assertDynamicContentClean(String content) {
        sensitiveWordService.assertCleanText(content);
    }

    public List<ContactVO> listContacts(Long userId) {
        // 默认好友配置可能早于联系人列表修复或用户导入生效，读取时补齐托管关系。
        defaultFriendService.ensureForUser(userId);
        List<ImFriend> friends = friendMapper.selectList(new LambdaQueryWrapper<ImFriend>()
                .eq(ImFriend::getUserId, userId)
                .orderByAsc(ImFriend::getFriendId));
        // 仅过滤「我拉黑的」；对方拉黑我时，本端好友行仍保留，通讯录继续显示
        Set<Long> blockedByMe = blockedByMeIds(userId);
        boolean viewerHidesOnline = hidesOnlineStatus(userId);
        Set<Long> hideOnlineTargets = new HashSet<>();
        List<Long> friendIds = friends.stream()
                .map(ImFriend::getFriendId)
                .filter(java.util.Objects::nonNull)
                .toList();
        if (!friendIds.isEmpty()) {
            List<SysUser> hidden = userMapper.selectList(new LambdaQueryWrapper<SysUser>()
                    .in(SysUser::getId, friendIds)
                    .eq(SysUser::getHideOnlineStatus, true));
            for (SysUser h : hidden) {
                if (h.getId() != null) {
                    hideOnlineTargets.add(h.getId());
                }
            }
        }
        List<ContactVO> result = new ArrayList<>();
        for (ImFriend f : friends) {
            if (blockedByMe.contains(f.getFriendId())) {
                continue;
            }
            SysUser u = userMapper.selectById(f.getFriendId());
            if (u == null) {
                continue;
            }
            String nickname = u.getNickname();
            String remark = f.getRemark();
            String displayName = displayNameService.displayName(userId, u, u.getId());
            String sortName = StringUtils.hasText(displayName) ? displayName : nickname;
            result.add(ContactVO.builder()
                    .userId(u.getId())
                    .pulseId(u.getPulseId())
                    .nickname(nickname)
                    .displayName(displayName)
                    .avatarUrl(u.getAvatarUrl())
                    .online(!viewerHidesOnline
                            && !hideOnlineTargets.contains(u.getId())
                            && isUserOnline(u.getId()))
                    .onlineHidden(viewerHidesOnline || hideOnlineTargets.contains(u.getId()))
                    .letter(letterOf(sortName))
                    .remark(remark)
                    .birthday(u.getBirthday())
                    .signature(u.getSignature())
                    .tag(f.getTag())
                    .friendAddSource(effectiveFriendAddSource(f, u.getId()))
                    .fileTransferAssistant(Boolean.TRUE.equals(u.getFileTransferAssistant()))
                    .build());
        }
        result.sort((a, b) -> a.getLetter().compareToIgnoreCase(b.getLetter()));
        return result;
    }

    public boolean isUserOnline(Long userId) {
        if (userId == null) {
            return false;
        }
        return StringUtils.hasText(redis.opsForValue().get(RedisKeys.online(userId)));
    }

    /** 对查看者可见的在线状态：被对方拉黑时恒为离线 */
    public boolean isUserOnlineVisibleTo(Long viewerId, Long targetUserId) {
        if (targetUserId == null) {
            return false;
        }
        if (viewerId != null && !viewerId.equals(targetUserId) && isBlockedByMe(targetUserId, viewerId)) {
            return false;
        }
        // 隐藏在线状态：任意一方开启，双方都看不到对方在线状态
        if (isOnlineHiddenFor(viewerId, targetUserId)) {
            return false;
        }
        return isUserOnline(targetUserId);
    }

    /** 在线状态是否被隐藏（任意一方开启隐藏即隐藏） */
    public boolean isOnlineHiddenFor(Long viewerId, Long targetUserId) {
        if (viewerId == null || targetUserId == null || viewerId.equals(targetUserId)) {
            return false;
        }
        return hidesOnlineStatus(viewerId) || hidesOnlineStatus(targetUserId);
    }

    private boolean hidesOnlineStatus(Long userId) {
        if (userId == null) {
            return false;
        }
        SysUser u = userMapper.selectById(userId);
        return u != null && Boolean.TRUE.equals(u.getHideOnlineStatus());
    }

    public List<MessageVO> listMessages(Long userId, Long conversationId) {
        return listMessages(userId, conversationId, null, null, 200);
    }

    /**
     * @param afterTime 若有值，只返回该时间之后的新消息（升序）；否则返回最近 limit 条（再按时间升序）
     */
    public List<MessageVO> listMessages(Long userId, Long conversationId, String afterTime, String beforeTime, Integer limit) {
        // 越权防护：读取消息前必须先确认当前用户是该会话成员
        assertMember(userId, conversationId);
        int lim = limit == null ? 200 : Math.min(Math.max(limit, 1), 200);
        OffsetDateTime historyFrom = resolveHistoryFrom(userId, conversationId);
        OffsetDateTime after = parseSearchRangeStart(afterTime); // yyyy-MM-dd or ISO；增量用精确时间
        if (StringUtils.hasText(afterTime) && after == null) {
            try {
                after = OffsetDateTime.parse(afterTime.trim());
            } catch (Exception ignored) {
                after = null;
            }
        }
        OffsetDateTime before = parseSearchRangeStart(beforeTime);
        if (StringUtils.hasText(beforeTime) && before == null) {
            try {
                before = OffsetDateTime.parse(beforeTime.trim());
            } catch (Exception ignored) {
                before = null;
            }
        }
        LambdaQueryWrapper<ImMessage> query = new LambdaQueryWrapper<ImMessage>()
                .eq(ImMessage::getConversationId, conversationId);
        if (historyFrom != null) {
            query.ge(ImMessage::getSendTime, historyFrom);
        }
        if (after != null) {
            query.gt(ImMessage::getSendTime, after)
                    .orderByAsc(ImMessage::getSendTime)
                    .last("LIMIT " + lim);
        } else {
            if (before != null) {
                query.lt(ImMessage::getSendTime, before);
            }
            // 最近 lim 条：先倒序取再反转，避免 ASC+LIMIT 只拿到最旧消息
            query.orderByDesc(ImMessage::getSendTime)
                    .last("LIMIT " + lim);
        }
        List<ImMessage> messages = messageMapper.selectList(query);
        if (after == null && messages.size() > 1) {
            java.util.Collections.reverse(messages);
        }
        java.util.Set<String> hidden = hiddenMsgIds(userId, conversationId);
        Map<Long, SysUser> userCache = new java.util.HashMap<>();
        Map<String, ImMessage> msgById = indexByMsgId(messages);
        List<MessageVO> list = new ArrayList<>();
        java.util.HashSet<String> seenClientIds = new java.util.HashSet<>();
        for (ImMessage m : messages) {
            if (hidden.contains(m.getMsgId())) {
                continue;
            }
            if (burnAfterReadService.isExpired(m.getBurnExpiresAt())) {
                continue;
            }
            if (burnAfterReadService.isExpired(m.getAutoDeleteExpiresAt())) {
                continue;
            }
            if (StringUtils.hasText(m.getClientMsgId()) && !seenClientIds.add(m.getClientMsgId())) {
                continue;
            }
            list.add(toMessageVO(m, 0L, userCache, msgById, userId));
        }
        return list;
    }

    /**
     * 会话内搜索/筛选聊天记录。
     * filter: media(图片与视频) | file(文件) | contact(名片) | date(按日期，配合 from/to)
     * from/to: yyyy-MM-dd 或 ISO 时间
     */
    public List<MessageVO> searchMessages(
            Long userId,
            Long conversationId,
            String keyword,
            String filter,
            String from,
            String to
    ) {
        String q = keyword == null ? "" : keyword.trim();
        String f = filter == null ? "" : filter.trim().toLowerCase();
        if ("image_video".equals(f) || "image-video".equals(f)) {
            f = "media";
        }
        if ("card".equals(f)) {
            f = "contact";
        }
        boolean hasKeyword = StringUtils.hasText(q);
        boolean hasFilter = StringUtils.hasText(f);
        boolean hasRange = StringUtils.hasText(from) || StringUtils.hasText(to);
        if (!hasKeyword && !hasFilter && !hasRange) {
            throw new BizException("请输入搜索关键词");
        }
        Long joined = memberMapper.selectCount(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, userId));
        if (joined == null || joined == 0) {
            throw new BizException("你不在该会话中");
        }
        OffsetDateTime historyFrom = resolveHistoryFrom(userId, conversationId);
        LambdaQueryWrapper<ImMessage> query = new LambdaQueryWrapper<ImMessage>()
                .eq(ImMessage::getConversationId, conversationId)
                .and(w -> w.isNull(ImMessage::getRecalled).or().eq(ImMessage::getRecalled, false))
                .orderByDesc(ImMessage::getSendTime)
                .last("LIMIT 300");
        if (hasKeyword) {
            query.like(ImMessage::getContent, q);
        }
        if ("media".equals(f)) {
            query.in(ImMessage::getMsgType, 1, 2);
        } else if ("file".equals(f)) {
            query.eq(ImMessage::getMsgType, 2);
        } else if ("contact".equals(f)) {
            query.eq(ImMessage::getMsgType, 5);
        }
        OffsetDateTime fromTime = parseSearchRangeStart(from);
        OffsetDateTime toTime = parseSearchRangeEnd(to);
        if (fromTime != null) {
            query.ge(ImMessage::getSendTime, fromTime);
        }
        if (toTime != null) {
            query.le(ImMessage::getSendTime, toTime);
        }
        if (historyFrom != null) {
            query.ge(ImMessage::getSendTime, historyFrom);
        }
        List<ImMessage> messages = messageMapper.selectList(query);
        if (hasKeyword) {
            String normalizedKeyword = q.toLowerCase(Locale.ROOT);
            messages = messages.stream()
                    .filter(message -> searchableMessageText(message)
                            .toLowerCase(Locale.ROOT)
                            .contains(normalizedKeyword))
                    .collect(java.util.stream.Collectors.toList());
        }
        if ("media".equals(f)) {
            messages = messages.stream()
                    .filter(m -> m.getMsgType() != null
                            && (m.getMsgType() == 1 || isVideoMessageContent(m.getContent())))
                    .collect(java.util.stream.Collectors.toList());
        } else if ("file".equals(f)) {
            messages = messages.stream()
                    .filter(m -> m.getMsgType() != null
                            && m.getMsgType() == 2
                            && !isVideoMessageContent(m.getContent()))
                    .collect(java.util.stream.Collectors.toList());
        }
        if (messages.size() > 200) {
            messages = messages.subList(0, 200);
        }
        java.util.Set<String> hidden = hiddenMsgIds(userId, conversationId);
        Map<Long, SysUser> userCache = new java.util.HashMap<>();
        Map<String, ImMessage> msgById = indexByMsgId(messages);
        List<MessageVO> list = new ArrayList<>();
        java.util.HashSet<String> seenClientIds = new java.util.HashSet<>();
        for (ImMessage m : messages) {
            if (hidden.contains(m.getMsgId())) {
                continue;
            }
            if (burnAfterReadService.isExpired(m.getBurnExpiresAt())) {
                continue;
            }
            if (burnAfterReadService.isExpired(m.getAutoDeleteExpiresAt())) {
                continue;
            }
            if (StringUtils.hasText(m.getClientMsgId()) && !seenClientIds.add(m.getClientMsgId())) {
                continue;
            }
            list.add(toMessageVO(m, 0L, userCache, msgById, userId));
        }
        return list;
    }

    private boolean isVideoMessageContent(String content) {
        if (!StringUtils.hasText(content)) {
            return false;
        }
        String c = content.toLowerCase(Locale.ROOT);
        if (c.contains("\"contenttype\":\"video/") || c.contains("\"contenttype\": \"video/")) {
            return true;
        }
        if (c.contains("video/")) {
            return true;
        }
        // 避免复杂正则在大 JSON 上回溯导致 StackOverflow
        return c.contains(".mp4")
                || c.contains(".webm")
                || c.contains(".mov")
                || c.contains(".m4v")
                || c.contains(".mkv")
                || c.contains(".3gp");
    }

    private OffsetDateTime parseSearchRangeStart(String raw) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        try {
            String s = raw.trim();
            if (s.length() <= 10) {
                return LocalDate.parse(s.substring(0, Math.min(10, s.length())))
                        .atStartOfDay()
                        .atOffset(java.time.ZoneOffset.ofHours(8));
            }
            return OffsetDateTime.parse(s);
        } catch (Exception e) {
            return null;
        }
    }

    private OffsetDateTime parseSearchRangeEnd(String raw) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        try {
            String s = raw.trim();
            if (s.length() <= 10) {
                return LocalDate.parse(s.substring(0, Math.min(10, s.length())))
                        .plusDays(1)
                        .atStartOfDay()
                        .atOffset(java.time.ZoneOffset.ofHours(8))
                        .minusNanos(1);
            }
            return OffsetDateTime.parse(s);
        } catch (Exception e) {
            return null;
        }
    }

    public MessageVO sendTextMessage(
            Long fromUserId,
            Long conversationId,
            Long toUserId,
            String content,
            String clientMsgId,
            String replyToMsgId
    ) {
        return sendMessage(fromUserId, conversationId, toUserId, content, clientMsgId, replyToMsgId, 0);
    }

    public MessageVO sendMessage(
            Long fromUserId,
            Long conversationId,
            Long toUserId,
            String content,
            String clientMsgId,
            String replyToMsgId,
            int msgType
    ) {
        return sendMessage(fromUserId, conversationId, toUserId, content, clientMsgId, replyToMsgId, msgType, null, false, null);
    }

    public MessageVO sendMessage(
            Long fromUserId,
            Long conversationId,
            Long toUserId,
            String content,
            String clientMsgId,
            String replyToMsgId,
            int msgType,
            List<Long> mentionUserIds,
            boolean atAll
    ) {
        return sendMessage(fromUserId, conversationId, toUserId, content, clientMsgId, replyToMsgId,
                msgType, mentionUserIds, atAll, null);
    }

    /** New attachment path: content is a short marker and fileId points to MinIO metadata. */
    public MessageVO sendMessage(
            Long fromUserId,
            Long conversationId,
            Long toUserId,
            String content,
            String clientMsgId,
            String replyToMsgId,
            int msgType,
            List<Long> mentionUserIds,
            boolean atAll,
            String fileId
    ) {
        if (!StringUtils.hasText(content)) {
            throw new BizException("消息不能为空");
        }
        if (msgType == 1 || msgType == 2 || msgType == 3) {
            if (StringUtils.hasText(fileId)) {
                ImFile attachment = fileMapper.selectById(fileId.trim());
                if (attachment == null || !fromUserId.equals(attachment.getUploaderId())
                        || !"READY".equalsIgnoreCase(attachment.getStatus())) {
                    throw new BizException("文件不存在或尚未完成上传");
                }
                content = "file:" + attachment.getFileId();
            } else if (content.trim().startsWith("data:") || content.trim().startsWith("{")
                    || content.trim().startsWith("http") || content.trim().startsWith("/")) {
                throw new BizException("文件消息必须先通过 HTTP 上传");
            }
        } else if (StringUtils.hasText(fileId)) {
            throw new BizException("文件元数据只能用于文件消息");
        }
        // 文本消息：敏感词拦截（系统提示 / 通话 tip 除外）
        if (msgType == 0
                && !CallLogService.looksLikeCallTip(content, clientMsgId)) {
            sensitiveWordService.assertCleanText(content);
        }
        if (toUserId != null && toUserId.equals(fromUserId)) {
            throw new BizException("不能给自己发消息");
        }
        ImConversation conv = conversationMapper.selectById(conversationId);
        if (conv == null) {
            throw new BizException("会话不存在");
        }
        // 私聊：拉黑或非好友不可发消息
        if (conv.getType() != null && conv.getType() == 1) {
            Long peer = resolvePeerUserId(fromUserId, conversationId, toUserId);
            if (peer == null || peer <= 0) {
                throw new BizException("对方不是你好友，无法发送消息");
            }
            if (isBlockedEitherWay(fromUserId, peer)) {
                throw new BizException(isBlockedByMe(fromUserId, peer)
                        ? "已拉黑对方，无法发送消息"
                        : "您已被对方拉入黑名单");
            }
            if (!isFriend(fromUserId, peer)) {
                throw new BizException("对方不是你好友，无法发送消息");
            }
        }
        // 群聊：全员禁言 / 单人禁言（群主与管理员可发言；系统提示除外）
        if (conv.getType() != null && conv.getType() == 2 && msgType != 9) {
            assertGroupCanSpeak(fromUserId, conversationId, conv);
        }

        boolean isGroup = conv.getType() != null && conv.getType() == 2;
        boolean useAtAll = false;
        List<Long> mentions = List.of();
        if (isGroup && msgType == 0) {
            if (atAll) {
                assertGroupOwnerOrAdmin(fromUserId, conversationId, conv);
                useAtAll = true;
            }
            if (mentionUserIds != null && !mentionUserIds.isEmpty() && !useAtAll) {
                mentions = filterGroupMemberIds(conversationId, mentionUserIds, fromUserId);
            }
        }

        SysUser fromUser = resolveUser(fromUserId, new java.util.HashMap<>());
        String fromNickname = nicknameOf(fromUser, fromUserId);
        String fromAvatarUrl = fromUser != null ? fromUser.getAvatarUrl() : null;
        if (StringUtils.hasText(clientMsgId)) {
            ImMessage existing = messageMapper.selectOne(new LambdaQueryWrapper<ImMessage>()
                    .eq(ImMessage::getClientMsgId, clientMsgId)
                    .last("LIMIT 1"));
            if (existing != null) {
                return toMessageVO(existing, toUserId == null ? 0L : toUserId, new java.util.HashMap<>(), null, fromUserId);
            }
        }

        ImMessage replyTarget = null;
        if (StringUtils.hasText(replyToMsgId)) {
            replyTarget = messageMapper.selectOne(new LambdaQueryWrapper<ImMessage>()
                    .eq(ImMessage::getMsgId, replyToMsgId.trim())
                    .eq(ImMessage::getConversationId, conversationId)
                    .last("LIMIT 1"));
            if (replyTarget == null) {
                throw new BizException("引用的消息不存在");
            }
        }

        ImMessage m = new ImMessage();
        m.setMsgId(java.util.UUID.randomUUID().toString().replace("-", ""));
        m.setConversationId(conversationId);
        m.setFromUserId(fromUserId);
        m.setMsgType(msgType);
        m.setContent(content.trim());
        m.setFileId(StringUtils.hasText(fileId) ? fileId.trim() : null);
        m.setClientMsgId(clientMsgId);
        m.setReplyToMsgId(replyTarget != null ? replyTarget.getMsgId() : null);
        m.setRecalled(false);
        m.setAtAll(useAtAll);
        m.setMentionUserIds(useAtAll ? null : joinIds(mentions));
        Integer burnSeconds = burnAfterReadService.resolveBurnSeconds(fromUserId, conversationId, msgType);
        m.setBurnAfterRead(burnSeconds != null);
        m.setBurnSeconds(burnSeconds);
        m.setAutoDeleteExpiresAt(autoDeleteMessageService.resolveExpiry(fromUserId, conversationId));
        m.setScheduledMessage(false);
        m.setSendTime(OffsetDateTime.now());
        messageMapper.insert(m);

        try {
            if (CallLogService.looksLikeCallTip(m.getContent(), m.getClientMsgId())) {
                Long peerForCall = resolvePeerUserId(fromUserId, conversationId, toUserId);
                callLogService.recordFromCallTip(m, peerForCall);
            }
        } catch (Exception e) {
            log.warn("record call log failed: {}", e.getMessage());
        }

        ImConversation c = conv;
        if (c != null) {
            c.setLastMsgPreview(sessionPreview(m));
            c.setLastMsgTime(OffsetDateTime.now());
            c.setUpdatedAt(OffsetDateTime.now());
            conversationMapper.updateById(c);
        }

        Map<String, ImMessage> replyIndex = new java.util.HashMap<>();
        if (replyTarget != null) {
            replyIndex.put(replyTarget.getMsgId(), replyTarget);
        }
        MessageVO vo = toMessageVO(m, 0L, new java.util.HashMap<>(), replyIndex, fromUserId);
        String sourceDeviceId = AuthContext.currentDeviceId();

        java.util.Set<Long> mentionSet = useAtAll ? null : new java.util.HashSet<>(mentions);
        List<ImConversationMember> targets = memberMapper.selectList(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId));
        Long peerId = resolvePeerUserId(fromUserId, conversationId, toUserId);
        java.util.HashSet<Long> pushed = new java.util.HashSet<>();
        for (ImConversationMember mem : targets) {
            boolean isSender = fromUserId != null && fromUserId.equals(mem.getUserId());
            if (isSender) {
                publishImPush(m, fromUserId, fromNickname, fromAvatarUrl, mem.getUserId(), vo, false, true, sourceDeviceId);
                pushed.add(mem.getUserId());
                continue;
            }
            // 首页删除仅隐藏：有新消息时重新显示
            mem.setHidden(false);
            mem.setUnreadCount((mem.getUnreadCount() == null ? 0 : mem.getUnreadCount()) + 1);
            boolean hitMention = useAtAll
                    || (mentionSet != null && mem.getUserId() != null && mentionSet.contains(mem.getUserId()));
            boolean notificationAllowed = importantNotificationAllowed(
                    conv, mem, m, !useAtAll && hitMention, replyTarget);
            if (hitMention) {
                mem.setMentionUnread(true);
            }
            memberMapper.updateById(mem);
            publishImPush(m, fromUserId, fromNickname, fromAvatarUrl, mem.getUserId(), vo, hitMention, notificationAllowed, sourceDeviceId);
            pushed.add(mem.getUserId());
        }
        // 私聊：对方成员行被旧版硬删时补回，并推送
        if (peerId != null && peerId > 0 && !peerId.equals(fromUserId) && !pushed.contains(peerId)) {
            ImConversationMember peerMem = memberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                    .eq(ImConversationMember::getConversationId, conversationId)
                    .eq(ImConversationMember::getUserId, peerId)
                    .last("LIMIT 1"));
            if (peerMem == null) {
                peerMem = new ImConversationMember();
                peerMem.setConversationId(conversationId);
                peerMem.setUserId(peerId);
                peerMem.setPeerUserId(fromUserId);
                peerMem.setUnreadCount(1);
                peerMem.setMute(false);
                peerMem.setArchived(false);
                peerMem.setPinned(false);
                peerMem.setHidden(false);
                peerMem.setRole("member");
                peerMem.setJoinedAt(OffsetDateTime.now());
                memberMapper.insert(peerMem);
            } else {
                peerMem.setHidden(false);
                peerMem.setUnreadCount((peerMem.getUnreadCount() == null ? 0 : peerMem.getUnreadCount()) + 1);
                memberMapper.updateById(peerMem);
            }
            // 私聊推送：接收方看到的发送者昵称优先其好友备注（含默认好友新昵称）
            publishImPush(m, fromUserId, displayNameOf(peerId, fromUser, fromUserId), fromAvatarUrl, peerId, vo, false, true, sourceDeviceId);
        }
        // 发送方自己若曾隐藏该会话，发消息后也重新显示
        ImConversationMember selfMem = memberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, fromUserId)
                .last("LIMIT 1"));
        if (selfMem != null && Boolean.TRUE.equals(selfMem.getHidden())) {
            selfMem.setHidden(false);
            memberMapper.updateById(selfMem);
        }

        vo.setToUserId(peerId == null ? 0L : peerId);
        return vo;
    }

    public MessageVO recallMessage(Long userId, Long conversationId, String msgId) {
        if (!StringUtils.hasText(msgId)) {
            throw new BizException("消息不存在");
        }
        Long joined = memberMapper.selectCount(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, userId));
        if (joined == null || joined == 0) {
            throw new BizException("你不在该会话中");
        }
        ImMessage m = messageMapper.selectOne(new LambdaQueryWrapper<ImMessage>()
                .eq(ImMessage::getMsgId, msgId.trim())
                .eq(ImMessage::getConversationId, conversationId)
                .last("LIMIT 1"));
        if (m == null) {
            throw new BizException("消息不存在");
        }
        if (!userId.equals(m.getFromUserId())) {
            throw new BizException("只能撤回自己的消息");
        }
        if (Boolean.TRUE.equals(m.getRecalled())) {
            return toMessageVO(m, 0L, new java.util.HashMap<>(), null);
        }
        if (m.getSendTime() == null || m.getSendTime().isBefore(OffsetDateTime.now().minusMinutes(2))) {
            throw new BizException("超过2分钟无法撤回");
        }
        m.setRecalled(true);
        messageMapper.updateById(m);

        ImConversation c = conversationMapper.selectById(conversationId);
        if (c != null) {
            ImMessage last = messageMapper.selectOne(new LambdaQueryWrapper<ImMessage>()
                    .eq(ImMessage::getConversationId, conversationId)
                    .and(w -> w.isNull(ImMessage::getRecalled).or().eq(ImMessage::getRecalled, false))
                    .orderByDesc(ImMessage::getSendTime)
                    .last("LIMIT 1"));
            if (last != null) {
                c.setLastMsgPreview(previewOf(last));
                c.setLastMsgTime(last.getSendTime());
            } else {
                c.setLastMsgPreview("撤回了一条消息");
                c.setLastMsgTime(OffsetDateTime.now());
            }
            c.setUpdatedAt(OffsetDateTime.now());
            conversationMapper.updateById(c);
        }

        MessageVO vo = toMessageVO(m, 0L, new java.util.HashMap<>(), null);
        List<ImConversationMember> targets = memberMapper.selectList(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .ne(ImConversationMember::getUserId, userId));
        for (ImConversationMember mem : targets) {
            publishRecallPush(m, userId, mem.getUserId());
        }
        return vo;
    }

    @org.springframework.transaction.annotation.Transactional
    public void hideMessages(Long userId, Long conversationId, List<String> msgIds, boolean both) {
        if (msgIds == null || msgIds.isEmpty()) {
            throw new BizException("请选择要删除的消息");
        }
        assertMember(userId, conversationId);
        // 群聊双向删除：仅群主可执行，防止普通成员绕过前端直接调用
        if (both) {
            ImConversation conv = conversationMapper.selectById(conversationId);
            if (conv != null && conv.getType() != null && conv.getType() == 2) {
                Long ownerId = conv.getOwnerId();
                ImConversationMember mine = memberMapper.selectOne(
                        new LambdaQueryWrapper<ImConversationMember>()
                                .eq(ImConversationMember::getConversationId, conversationId)
                                .eq(ImConversationMember::getUserId, userId)
                                .last("LIMIT 1"));
                boolean isOwner = (ownerId != null && ownerId.equals(userId))
                        || (mine != null && "owner".equalsIgnoreCase(mine.getRole()));
                if (!isOwner) {
                    throw new BizException("仅群主可双向删除群消息");
                }
            }
        }
        List<Long> targetUserIds = both
                ? memberMapper.selectList(new LambdaQueryWrapper<ImConversationMember>()
                        .eq(ImConversationMember::getConversationId, conversationId))
                        .stream()
                        .map(ImConversationMember::getUserId)
                        .filter(java.util.Objects::nonNull)
                        .distinct()
                        .toList()
                : List.of(userId);
        OffsetDateTime now = OffsetDateTime.now();
        for (String raw : msgIds) {
            if (!StringUtils.hasText(raw)) continue;
            String msgId = raw.trim();
            Long messageCount = messageMapper.selectCount(new LambdaQueryWrapper<ImMessage>()
                    .eq(ImMessage::getConversationId, conversationId)
                    .eq(ImMessage::getMsgId, msgId));
            if (messageCount == null || messageCount == 0) continue;
            for (Long targetUserId : targetUserIds) {
                Long exists = messageHideMapper.selectCount(new LambdaQueryWrapper<ImMessageHide>()
                        .eq(ImMessageHide::getUserId, targetUserId)
                        .eq(ImMessageHide::getMsgId, msgId));
                if (exists != null && exists > 0) continue;
                ImMessageHide hide = new ImMessageHide();
                hide.setUserId(targetUserId);
                hide.setConversationId(conversationId);
                hide.setMsgId(msgId);
                hide.setCreatedAt(now);
                messageHideMapper.insert(hide);
            }
        }
    }

    public FavoriteVO addFavorite(Long userId, Long conversationId, String msgId) {
        if (!StringUtils.hasText(msgId)) {
            throw new BizException("消息不存在");
        }
        assertMember(userId, conversationId);
        ImMessage m = messageMapper.selectOne(new LambdaQueryWrapper<ImMessage>()
                .eq(ImMessage::getMsgId, msgId.trim())
                .eq(ImMessage::getConversationId, conversationId)
                .last("LIMIT 1"));
        if (m == null) {
            throw new BizException("消息不存在");
        }
        if (Boolean.TRUE.equals(m.getRecalled())) {
            throw new BizException("已撤回的消息无法收藏");
        }
        if (Boolean.TRUE.equals(m.getBurnAfterRead())) {
            throw new BizException("阅后即焚消息禁止收藏");
        }
        ImFavorite existing = favoriteMapper.selectOne(new LambdaQueryWrapper<ImFavorite>()
                .eq(ImFavorite::getUserId, userId)
                .eq(ImFavorite::getMsgId, m.getMsgId())
                .last("LIMIT 1"));
        if (existing != null) {
            return toFavoriteVO(existing);
        }
        SysUser from = userMapper.selectById(m.getFromUserId());
        ImConversation c = conversationMapper.selectById(conversationId);
        ImFavorite fav = new ImFavorite();
        fav.setUserId(userId);
        fav.setConversationId(conversationId);
        fav.setMsgId(m.getMsgId());
        fav.setMsgType(m.getMsgType() == null ? 0 : m.getMsgType());
        // 存原始内容，便于收藏详情展示图片/文件等
        fav.setContent(m.getContent() == null ? "" : m.getContent());
        fav.setFileId(m.getFileId());
        fav.setFromNickname(displayNameOf(userId, from, m.getFromUserId()));
        fav.setSourceTitle(c != null ? c.getTitle() : "聊天");
        fav.setCreatedAt(OffsetDateTime.now());
        favoriteMapper.insert(fav);
        return toFavoriteVO(fav);
    }

    public List<FavoriteVO> listFavorites(Long userId) {
        List<ImFavorite> list = favoriteMapper.selectList(new LambdaQueryWrapper<ImFavorite>()
                .eq(ImFavorite::getUserId, userId)
                .orderByDesc(ImFavorite::getCreatedAt)
                .last("LIMIT 200"));
        List<FavoriteVO> out = new ArrayList<>();
        for (ImFavorite f : list) {
            out.add(toFavoriteVO(f));
        }
        return out;
    }

    public FavoriteVO getFavorite(Long userId, Long favoriteId) {
        ImFavorite f = favoriteMapper.selectById(favoriteId);
        if (f == null || !userId.equals(f.getUserId())) {
            throw new BizException("收藏不存在");
        }
        return toFavoriteVO(f);
    }

    public void removeFavorite(Long userId, Long favoriteId) {
        ImFavorite f = favoriteMapper.selectById(favoriteId);
        if (f == null || !userId.equals(f.getUserId())) {
            throw new BizException("收藏不存在");
        }
        favoriteMapper.deleteById(favoriteId);
    }

    /**
     * 转发收藏内容到指定会话（使用收藏快照，原消息删除后仍可转发）。
     */
    public int forwardFavorite(Long userId, Long favoriteId, List<Long> targetConversationIds) {
        if (targetConversationIds == null || targetConversationIds.isEmpty()) {
            throw new BizException("请选择转发目标");
        }
        FavoriteVO fav = getFavorite(userId, favoriteId);
        int type = fav.getMsgType() == null ? 0 : fav.getMsgType();
        if (type == 10) {
            throw new BizException("朋友圈动态暂不支持转发");
        }
        String content = fav.getContent() == null ? "" : fav.getContent();
        if (type == 1 || type == 2 || type == 3 || type == 4 || type == 5) {
            // 图片 / 文件视频 / 语音 / 聊天记录 / 名片：按原类型转发
            if (!StringUtils.hasText(content)) {
                throw new BizException("收藏内容无法转发");
            }
        } else {
            // 文本 / 系统提示等按文本转发
            if (!StringUtils.hasText(content)) {
                throw new BizException("收藏内容无法转发");
            }
            type = 0;
        }

        int total = 0;
        for (Long targetConversationId : targetConversationIds) {
            if (targetConversationId == null) {
                continue;
            }
            assertMember(userId, targetConversationId);
            String clientMsgId = "favfwd_" + favoriteId + "_" + targetConversationId + "_" + System.currentTimeMillis();
            sendMessage(userId, targetConversationId, null, content, clientMsgId, null, type,
                    null, false, fav.getFileId());
            total += 1;
        }
        if (total == 0) {
            throw new BizException("没有可转发的目标");
        }
        return total;
    }

    public int forwardMessages(Long userId, Long fromConversationId, List<Long> targetConversationIds, List<String> msgIds, String mode) {
        if (msgIds == null || msgIds.isEmpty()) {
            throw new BizException("请选择要转发的消息");
        }
        if (targetConversationIds == null || targetConversationIds.isEmpty()) {
            throw new BizException("请选择转发目标");
        }
        assertMember(userId, fromConversationId);

        // 按时间排序收集源消息
        List<ImMessage> sources = new ArrayList<>();
        java.util.HashSet<String> seen = new java.util.HashSet<>();
        for (String raw : msgIds) {
            if (!StringUtils.hasText(raw) || !seen.add(raw.trim())) continue;
            ImMessage src = messageMapper.selectOne(new LambdaQueryWrapper<ImMessage>()
                    .eq(ImMessage::getMsgId, raw.trim())
                    .eq(ImMessage::getConversationId, fromConversationId)
                    .last("LIMIT 1"));
            if (src == null || Boolean.TRUE.equals(src.getRecalled())) continue;
            if (Boolean.TRUE.equals(src.getBurnAfterRead())) {
                throw new BizException("阅后即焚消息禁止转发");
            }
            sources.add(src);
        }
        if (sources.isEmpty()) {
            throw new BizException("没有可转发的消息");
        }
        sources.sort((a, b) -> {
            if (a.getSendTime() == null && b.getSendTime() == null) return 0;
            if (a.getSendTime() == null) return -1;
            if (b.getSendTime() == null) return 1;
            return a.getSendTime().compareTo(b.getSendTime());
        });

        ImConversation fromConv = conversationMapper.selectById(fromConversationId);
        String sourceTitle = fromConv != null && StringUtils.hasText(fromConv.getTitle())
                ? fromConv.getTitle()
                : "聊天";
        boolean mergeCard = sources.size() > 1 && !"separate".equalsIgnoreCase(mode);
        String cardJson = null;
        if (mergeCard) {
            cardJson = buildForwardCardJson(userId, sourceTitle, sources);
        }

        int total = 0;
        for (Long targetConversationId : targetConversationIds) {
            if (targetConversationId == null) continue;
            assertMember(userId, targetConversationId);
            if (mergeCard) {
                String clientMsgId = "fwdcard_" + fromConversationId + "_" + targetConversationId + "_" + System.currentTimeMillis();
                sendMessage(userId, targetConversationId, null, cardJson, clientMsgId, null, 4);
                total += 1;
            } else {
                for (ImMessage src : sources) {
                    String content;
                    int type = src.getMsgType() == null ? 0 : src.getMsgType();
                    if (type == 1 || type == 2 || type == 4 || type == 5) {
                        content = src.getContent();
                    } else {
                        content = previewOf(src);
                        type = 0;
                    }
                    if (!StringUtils.hasText(content)) continue;
                    String clientMsgId = "fwd_" + src.getMsgId() + "_" + targetConversationId + "_" + System.nanoTime();
                    sendMessage(userId, targetConversationId, null, content, clientMsgId, null, type,
                            null, false, (type == 1 || type == 2 || type == 3) ? src.getFileId() : null);
                    total += 1;
                }
            }
        }
        if (total == 0) {
            throw new BizException("没有可转发的消息");
        }
        return total;
    }

    public MessageVO getMessage(Long userId, Long conversationId, String msgId) {
        assertMember(userId, conversationId);
        if (!StringUtils.hasText(msgId)) {
            throw new BizException("消息不存在");
        }
        if (hiddenMsgIds(userId, conversationId).contains(msgId.trim())) {
            throw new BizException("消息不存在");
        }
        ImMessage m = messageMapper.selectOne(new LambdaQueryWrapper<ImMessage>()
                .eq(ImMessage::getMsgId, msgId.trim())
                .eq(ImMessage::getConversationId, conversationId)
                .last("LIMIT 1"));
        if (m == null) {
            throw new BizException("消息不存在");
        }
        if (burnAfterReadService.isExpired(m.getBurnExpiresAt())) {
            throw new BizException("消息已销毁");
        }
        if (burnAfterReadService.isExpired(m.getAutoDeleteExpiresAt())) {
            throw new BizException("消息已自动删除");
        }
        OffsetDateTime historyFrom = resolveHistoryFrom(userId, conversationId);
        if (historyFrom != null && m.getSendTime() != null && m.getSendTime().isBefore(historyFrom)) {
            throw new BizException("消息不存在");
        }
        return toMessageVO(m, 0L, new java.util.HashMap<>(), null, userId);
    }

    /** 群聊仅可见入群时间之后的消息（退群再进也不看旧记录） */
    private OffsetDateTime resolveHistoryFrom(Long userId, Long conversationId) {
        ImConversation conv = conversationMapper.selectById(conversationId);
        if (conv == null || conv.getType() == null || conv.getType() != 2) {
            return null;
        }
        ImConversationMember mine = memberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, userId)
                .last("LIMIT 1"));
        return mine == null ? null : mine.getJoinedAt();
    }

    private String buildForwardCardJson(Long viewerId, String sourceTitle, List<ImMessage> sources) {
        Map<Long, SysUser> userCache = new java.util.HashMap<>();
        List<Map<String, Object>> items = new ArrayList<>();
        for (ImMessage src : sources) {
            SysUser u = resolveUser(src.getFromUserId(), userCache);
            Map<String, Object> item = new java.util.LinkedHashMap<>();
            item.put("msgId", src.getMsgId());
            item.put("fromUserId", src.getFromUserId());
            item.put("fromNickname", displayNameOf(viewerId, u, src.getFromUserId()));
            item.put("msgType", src.getMsgType() == null ? 0 : src.getMsgType());
            item.put("fileId", src.getFileId());
            item.put("content", Boolean.TRUE.equals(src.getRecalled()) ? "" : (src.getContent() == null ? "" : src.getContent()));
            item.put("createdAt", src.getSendTime() == null ? null : src.getSendTime().toString());
            items.add(item);
        }
        Map<String, Object> root = new java.util.LinkedHashMap<>();
        root.put("title", sourceTitle + "的聊天记录");
        root.put("sourceTitle", sourceTitle);
        root.put("count", items.size());
        root.put("items", items);
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(root);
        } catch (Exception e) {
            throw new BizException("生成转发卡片失败");
        }
    }

    private String sessionPreview(ImMessage m) {
        if (m == null) return "";
        Integer t = m.getMsgType();
        if (t != null && t == 9) {
            String c = m.getContent() == null ? "" : m.getContent();
            if (CallLogService.looksLikeCallTip(c, m.getClientMsgId())) {
                return CallLogService.displayCallPreview(c);
            }
            String text = CallLogService.displayCallText(c);
            return StringUtils.hasText(text) ? text : (c.length() > 80 ? c.substring(0, 80) + "…" : c);
        }
        if (t != null && t == 4) {
            try {
                com.fasterxml.jackson.databind.JsonNode n =
                        new com.fasterxml.jackson.databind.ObjectMapper().readTree(m.getContent());
                String title = n.path("title").asText("");
                return StringUtils.hasText(title) ? ("[聊天记录] " + title) : "[聊天记录]";
            } catch (Exception e) {
                return "[聊天记录]";
            }
        }
        return previewOf(m);
    }

    private void assertMember(Long userId, Long conversationId) {
        Long joined = memberMapper.selectCount(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, userId));
        if (joined == null || joined == 0) {
            throw new BizException("你不在该会话中");
        }
    }

    private java.util.Set<String> hiddenMsgIds(Long userId, Long conversationId) {
        List<ImMessageHide> hides = messageHideMapper.selectList(new LambdaQueryWrapper<ImMessageHide>()
                .eq(ImMessageHide::getUserId, userId)
                .eq(ImMessageHide::getConversationId, conversationId));
        java.util.HashSet<String> set = new java.util.HashSet<>();
        for (ImMessageHide h : hides) {
            if (h.getMsgId() != null) set.add(h.getMsgId());
        }
        return set;
    }

    private FavoriteVO toFavoriteVO(ImFavorite f) {
        String content = f.getContent();
        Integer msgType = f.getMsgType() == null ? 0 : f.getMsgType();
        java.util.List<String> images = parseFavoriteImages(f.getImages());
        java.util.List<String> mediaTypes = parseFavoriteMediaTypes(f.getMediaTypes());
        // 兼容旧收藏：content 只有预览文案时，回源消息取原始内容
        if (needsFavoriteContentHydrate(msgType, content) && StringUtils.hasText(f.getMsgId())) {
            ImMessage src = messageMapper.selectOne(new LambdaQueryWrapper<ImMessage>()
                    .eq(ImMessage::getMsgId, f.getMsgId())
                    .last("LIMIT 1"));
            if (src != null && StringUtils.hasText(src.getContent()) && !Boolean.TRUE.equals(src.getRecalled())) {
                content = src.getContent();
                if (src.getMsgType() != null) {
                    msgType = src.getMsgType();
                }
            }
        }
        // 兼容旧的朋友圈收藏：图片当时没有落库，按 msgId(moment:postId) 回源朋友圈补图
        if (msgType == 10 && (images == null || images.isEmpty()) && StringUtils.hasText(f.getMsgId())) {
            String postId = f.getMsgId().startsWith("moment:") ? f.getMsgId().substring("moment:".length()) : "";
            if (StringUtils.hasText(postId)) {
                try {
                    MomentPost post = momentPostMapper.selectById(Long.valueOf(postId));
                    if (post != null) {
                        images = parseFavoriteImages(post.getImages());
                        mediaTypes = parseFavoriteMediaTypes(post.getMediaTypes());
                        if (!StringUtils.hasText(f.getMediaFileIds())) {
                            f.setMediaFileIds(post.getMediaFileIds());
                        }
                    }
                } catch (Exception ignored) {
                    // 朋友圈已删除时保留纯文字收藏
                }
            }
        }
        return FavoriteVO.builder()
                .id(f.getId())
                .conversationId(f.getConversationId())
                .msgId(f.getMsgId())
                .msgType(msgType)
                .content(content)
                .fileId(f.getFileId())
                .images(images)
                .mediaTypes(mediaTypes)
                .mediaFileIds(parseFavoriteFileIds(f.getMediaFileIds()))
                .fromNickname(f.getFromNickname())
                .sourceTitle(f.getSourceTitle())
                .createdAt(f.getCreatedAt())
                .build();
    }

    private static java.util.List<String> parseFavoriteImages(String raw) {
        if (!StringUtils.hasText(raw)) {
            return java.util.List.of();
        }
        try {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            com.fasterxml.jackson.databind.JsonNode node = mapper.readTree(raw);
            java.util.List<String> out = new java.util.ArrayList<>();
            if (node.isArray()) {
                node.forEach(item -> {
                    if (item != null && item.isTextual() && StringUtils.hasText(item.asText())) {
                        out.add(item.asText());
                    }
                });
                return out;
            }
            if (node.isTextual() && StringUtils.hasText(node.asText())) {
                return java.util.List.of(node.asText());
            }
        } catch (Exception ignored) {
            // 非 JSON 时按单条地址处理
        }
        String trimmed = raw.trim();
        return trimmed.isEmpty() ? java.util.List.of() : java.util.List.of(trimmed);
    }

    private static java.util.List<String> parseFavoriteMediaTypes(String raw) {
        if (!StringUtils.hasText(raw)) {
            return java.util.List.of();
        }
        java.util.List<String> out = new java.util.ArrayList<>();
        for (String item : raw.split(",")) {
            String type = item == null ? "" : item.trim().toLowerCase();
            if (!type.isEmpty()) {
                out.add(type);
            }
        }
        return out;
    }

    private static java.util.List<String> parseFavoriteFileIds(String raw) {
        if (!StringUtils.hasText(raw)) return java.util.List.of();
        java.util.List<String> out = new java.util.ArrayList<>();
        for (String item : raw.split(",")) {
            if (StringUtils.hasText(item)) out.add(item.trim());
        }
        return out;
    }

    private static boolean needsFavoriteContentHydrate(Integer msgType, String content) {
        if (!StringUtils.hasText(content)) return true;
        if (msgType != null && (msgType == 1 || msgType == 2 || msgType == 3 || msgType == 4 || msgType == 5 || msgType == 6)) {
            String c = content.trim();
            if (c.startsWith("{") || c.startsWith("http") || c.startsWith("/") || c.startsWith("data:")) {
                return false;
            }
            return true;
        }
        return false;
    }

    private Map<String, ImMessage> indexByMsgId(List<ImMessage> messages) {
        Map<String, ImMessage> map = new java.util.HashMap<>();
        for (ImMessage m : messages) {
            if (m.getMsgId() != null) {
                map.put(m.getMsgId(), m);
            }
        }
        // 补全不在当前页的引用目标
        java.util.HashSet<String> missing = new java.util.HashSet<>();
        for (ImMessage m : messages) {
            if (StringUtils.hasText(m.getReplyToMsgId()) && !map.containsKey(m.getReplyToMsgId())) {
                missing.add(m.getReplyToMsgId());
            }
        }
        if (!missing.isEmpty()) {
            List<ImMessage> refs = messageMapper.selectList(new LambdaQueryWrapper<ImMessage>()
                    .in(ImMessage::getMsgId, missing));
            for (ImMessage r : refs) {
                map.put(r.getMsgId(), r);
            }
        }
        return map;
    }

    private MessageVO toMessageVO(
            ImMessage m,
            Long toUserId,
            Map<Long, SysUser> userCache,
            Map<String, ImMessage> msgById
    ) {
        return toMessageVO(m, toUserId, userCache, msgById, null);
    }

    private MessageVO toMessageVO(
            ImMessage m,
            Long toUserId,
            Map<Long, SysUser> userCache,
            Map<String, ImMessage> msgById,
            Long viewerId
    ) {
        SysUser from = resolveUser(m.getFromUserId(), userCache);
        boolean recalled = Boolean.TRUE.equals(m.getRecalled());
        List<Long> mentionIds = parseIdList(m.getMentionUserIds());
        boolean atAll = Boolean.TRUE.equals(m.getAtAll());
        boolean mentionedMe = false;
        if (viewerId != null && !viewerId.equals(m.getFromUserId())) {
            mentionedMe = atAll || mentionIds.contains(viewerId);
        }
        FileMetadataVO file = null;
        if (StringUtils.hasText(m.getFileId())) {
            ImFile attachment = fileMapper.selectById(m.getFileId());
            if (attachment != null) file = chatFileStorageService.toMetadata(attachment);
        }
        MessageVO.MessageVOBuilder b = MessageVO.builder()
                .id(m.getMsgId())
                .conversationId(m.getConversationId())
                .fromUserId(m.getFromUserId())
                .fromNickname(displayNameOf(viewerId, from, m.getFromUserId()))
                .fromAvatarUrl(from != null ? from.getAvatarUrl() : null)
                .toUserId(toUserId == null ? 0L : toUserId)
                .content(recalled ? "" : (file == null ? personalizedBusinessContent(m, viewerId) : "file:" + m.getFileId()))
                .rawContent(recalled ? "" : m.getContent())
                .fileId(m.getFileId())
                .file(file)
                .msgType(m.getMsgType())
                .clientMsgId(m.getClientMsgId())
                .createdAt(m.getSendTime())
                .recalled(recalled)
                .scheduledMessage(Boolean.TRUE.equals(m.getScheduledMessage()))
                .replyToMsgId(m.getReplyToMsgId())
                .mentionUserIds(mentionIds)
                .atAll(atAll)
                .mentionedMe(mentionedMe);
        b.burnAfterRead(Boolean.TRUE.equals(m.getBurnAfterRead()))
                .burnSeconds(m.getBurnSeconds())
                .burnReadAt(m.getBurnReadAt())
                .burnExpiresAt(m.getBurnExpiresAt())
                .autoDeleteExpiresAt(m.getAutoDeleteExpiresAt());

        if (StringUtils.hasText(m.getReplyToMsgId())) {
            ImMessage reply = msgById != null ? msgById.get(m.getReplyToMsgId()) : null;
            if (reply == null) {
                reply = messageMapper.selectOne(new LambdaQueryWrapper<ImMessage>()
                        .eq(ImMessage::getMsgId, m.getReplyToMsgId())
                        .last("LIMIT 1"));
            }
            if (reply != null) {
                boolean replyRecalled = Boolean.TRUE.equals(reply.getRecalled());
                SysUser replyUser = resolveUser(reply.getFromUserId(), userCache);
                b.replyToNickname(displayNameOf(viewerId, replyUser, reply.getFromUserId()))
                        .replyToRecalled(replyRecalled)
                        .replyToMsgType(reply.getMsgType() == null ? 0 : reply.getMsgType())
                        .replyToContent(replyRecalled ? "该消息已撤回" : (reply.getContent() == null ? "" : reply.getContent()));
            }
        }
        return b.build();
    }

    /**
     * 红包消息状态需要按查看人返回：同一个群红包中，已领取的人显示“已领取”，
     * 未领取的人仍显示“领取红包”。该状态来自领取记录，刷新页面后不会丢失。
     */
    private String personalizedBusinessContent(ImMessage message, Long viewerId) {
        String content = message.getContent();
        if (viewerId == null || message.getMsgType() == null || message.getMsgType() != 7
                || !StringUtils.hasText(content)) {
            return content;
        }
        try {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            com.fasterxml.jackson.databind.JsonNode parsed = mapper.readTree(content);
            if (!(parsed instanceof com.fasterxml.jackson.databind.node.ObjectNode node)) return content;
            String businessNo = node.path("businessNo").asText("");
            if (!StringUtils.hasText(businessNo)) return content;
            Integer received = jdbc.queryForObject("""
                    SELECT COUNT(*) FROM red_packet_receive r
                    JOIN red_packet p ON p.id=r.packet_id
                    WHERE p.packet_no=? AND r.user_id=?
                    """, Integer.class, businessNo, viewerId);
            if (received != null && received > 0) {
                node.put("status", "RECEIVED");
            } else {
                String status = jdbc.queryForObject(
                        "SELECT status FROM red_packet WHERE packet_no=?", String.class, businessNo);
                if (StringUtils.hasText(status)) node.put("status", status);
            }
            return mapper.writeValueAsString(node);
        } catch (Exception e) {
            log.debug("personalize red packet status skipped: {}", e.toString());
            return content;
        }
    }

    private static String previewOf(ImMessage m) {
        if (m == null) return "";
        if (Boolean.TRUE.equals(m.getRecalled())) return "撤回了一条消息";
        if (StringUtils.hasText(m.getFileId())) {
            if (m.getMsgType() != null && m.getMsgType() == 1) return "[图片]";
            if (m.getMsgType() != null && m.getMsgType() == 3) return "[语音]";
            return "[文件]";
        }
        Integer t = m.getMsgType();
        if (t != null && t == 1) return "[图片]";
        if (t != null && t == 2) {
            String name = extractFileName(m.getContent());
            return StringUtils.hasText(name) ? ("[文件] " + name) : "[文件]";
        }
        if (t != null && t == 3) return "[语音]";
        if (t != null && t == 4) return "[聊天记录]";
        if (t != null && t == 5) {
            String nick = extractCardNickname(m.getContent());
            boolean groupCard = isGroupCard(m.getContent());
            if (StringUtils.hasText(nick)) {
                return (groupCard ? "[群名片] " : "[名片] ") + nick;
            }
            return groupCard ? "[群名片]" : "[名片]";
        }
        if (t != null && t == 6) return "[\u4f4d\u7f6e]";
        if (t != null && (t == 7 || t == 8)) {
            try {
                com.fasterxml.jackson.databind.JsonNode n =
                        new com.fasterxml.jackson.databind.ObjectMapper().readTree(m.getContent());
                if (t == 7) {
                    return "[红包] " + n.path("greeting").asText("恭喜发财，大吉大利");
                }
                return String.format(Locale.ROOT, "[转账] ¥%.2f", n.path("amount").asLong(0) / 100.0);
            } catch (Exception e) {
                return t == 7 ? "[红包]" : "[转账]";
            }
        }
        if (t != null && t == 9) return structuredMessagePreview(m.getContent());
        String c = m.getContent();
        if (c == null) return "";
        return c.length() > 80 ? c.substring(0, 80) + "…" : c;
    }

    private static String structuredMessagePreview(String content) {
        if (!StringUtils.hasText(content)) return "系统消息";
        try {
            com.fasterxml.jackson.databind.JsonNode node =
                    new com.fasterxml.jackson.databind.ObjectMapper().readTree(content);
            String kind = node.path("kind").asText(node.path("type").asText("")).toLowerCase(Locale.ROOT);
            String mediaType = node.path("mediaType").asText(node.path("media_type").asText("")).toLowerCase(Locale.ROOT);
            String text = node.path("text").asText(node.path("resultText").asText("通话已结束"));
            if (kind.contains("video") || "video".equals(mediaType)) return "[视频通话] " + text;
            if (kind.contains("voice") || kind.contains("audio") || node.has("callId") || node.has("call_id")) {
                return "[语音通话] " + text;
            }
            if (node.hasNonNull("text")) return node.path("text").asText();
            if (node.hasNonNull("message")) return node.path("message").asText();
            return "[结构化消息]";
        } catch (Exception ignored) {
            return content.length() > 80 ? content.substring(0, 80) + "…" : content;
        }
    }

    private static String searchableMessageText(ImMessage message) {
        if (message == null) return "";
        Integer type = message.getMsgType();
        String content = message.getContent() == null ? "" : message.getContent();
        if (type != null && type == 9) return structuredMessagePreview(content);
        if (type != null && type == 6) {
            try {
                com.fasterxml.jackson.databind.JsonNode node =
                        new com.fasterxml.jackson.databind.ObjectMapper().readTree(content);
                return String.join(" ",
                        node.path("name").asText(""),
                        node.path("title").asText(""),
                        node.path("address").asText(""),
                        node.path("locationName").asText(""),
                        node.path("locationAddress").asText(""),
                        node.path("description").asText(""));
            } catch (Exception ignored) {
                return "";
            }
        }
        if (type != null && type == 5) return extractCardNickname(content);
        if (type != null && (type == 7 || type == 8)) return previewOf(message);
        if (type != null && type == 2) return extractFileName(content) + " " + content;
        return content;
    }

    private static String extractFileName(String content) {
        if (!StringUtils.hasText(content)) return "";
        try {
            com.fasterxml.jackson.databind.JsonNode n =
                    new com.fasterxml.jackson.databind.ObjectMapper().readTree(content);
            return n.path("name").asText("");
        } catch (Exception e) {
            return "";
        }
    }

    private static String extractCardNickname(String content) {
        if (!StringUtils.hasText(content)) return "";
        try {
            com.fasterxml.jackson.databind.JsonNode n =
                    new com.fasterxml.jackson.databind.ObjectMapper().readTree(content);
            String nick = n.path("nickname").asText("");
            if (!StringUtils.hasText(nick)) {
                nick = n.path("title").asText("");
            }
            return nick;
        } catch (Exception e) {
            return "";
        }
    }

    private static boolean isGroupCard(String content) {
        if (!StringUtils.hasText(content)) return false;
        try {
            com.fasterxml.jackson.databind.JsonNode n =
                    new com.fasterxml.jackson.databind.ObjectMapper().readTree(content);
            return "group".equalsIgnoreCase(n.path("cardType").asText(""));
        } catch (Exception e) {
            return false;
        }
    }

    private SysUser resolveUser(Long userId, Map<Long, SysUser> cache) {
        if (userId == null) {
            return null;
        }
        if (cache.containsKey(userId)) {
            return cache.get(userId);
        }
        SysUser u = userMapper.selectById(userId);
        cache.put(userId, u);
        return u;
    }

    private String nicknameOf(SysUser u, Long userId) {
        return displayNameService.displayName(null, u, userId);
    }

    /** 查看者视角展示名：好友备注（含后台默认好友「新昵称」）优先，其次真实昵称 */
    private String displayNameOf(Long viewerId, SysUser u, Long userId) {
        return displayNameService.displayName(viewerId, u, userId);
    }

    private Long resolvePeerUserId(Long fromUserId, Long conversationId, Long toUserId) {
        if (toUserId != null && toUserId > 0 && !toUserId.equals(fromUserId)) {
            return toUserId;
        }
        ImConversationMember mine = memberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, fromUserId)
                .last("LIMIT 1"));
        if (mine != null && mine.getPeerUserId() != null && mine.getPeerUserId() > 0) {
            return mine.getPeerUserId();
        }
        ImConversationMember other = memberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .ne(ImConversationMember::getUserId, fromUserId)
                .last("LIMIT 1"));
        return other == null ? null : other.getUserId();
    }

    private void publishImPush(
            ImMessage m,
            Long fromUserId,
            String fromNickname,
            String fromAvatarUrl,
            Long toUserId,
            MessageVO vo
    ) {
        publishImPush(m, fromUserId, fromNickname, fromAvatarUrl, toUserId, vo, false, true, null);
    }

    private void publishImPush(
            ImMessage m,
            Long fromUserId,
            String fromNickname,
            String fromAvatarUrl,
            Long toUserId,
            MessageVO vo,
            boolean mentionedMe,
            boolean notificationAllowed,
            String sourceDeviceId
    ) {
        try {
            java.util.Map<String, Object> payload = new java.util.LinkedHashMap<>();
            payload.put("event", "message");
            payload.put("msgId", m.getMsgId() == null ? "" : m.getMsgId());
            payload.put("id", m.getMsgId() == null ? "" : m.getMsgId());
            payload.put("conversationId", m.getConversationId());
            payload.put("fromUserId", fromUserId);
            payload.put("fromNickname", fromNickname == null ? "" : fromNickname);
            payload.put("fromAvatarUrl", fromAvatarUrl == null ? "" : fromAvatarUrl);
            payload.put("toUserId", toUserId);
            payload.put("msgType", m.getMsgType() == null ? 0 : m.getMsgType());
            String transportContent = m.getContent() == null ? "" : m.getContent();
            boolean legacyFilePayload = (m.getMsgType() != null && (m.getMsgType() == 1 || m.getMsgType() == 2 || m.getMsgType() == 3))
                    && !StringUtils.hasText(m.getFileId())
                    && (transportContent.length() > 512 || transportContent.startsWith("data:"));
            payload.put("content", legacyFilePayload ? "[legacy-file]" : transportContent);
            payload.put("legacyFile", legacyFilePayload);
            payload.put("fileId", m.getFileId() == null ? "" : m.getFileId());
            payload.put("file", vo.getFile());
            payload.put("clientMsgId", m.getClientMsgId() == null ? "" : m.getClientMsgId());
            payload.put("sourceDeviceId", sourceDeviceId == null ? "" : sourceDeviceId);
            payload.put(
                    "sendTime",
                    m.getSendTime() == null ? System.currentTimeMillis() : m.getSendTime().toInstant().toEpochMilli());
            payload.put("recalled", false);
            payload.put("replyToMsgId", vo.getReplyToMsgId() == null ? "" : vo.getReplyToMsgId());
            payload.put("replyToContent", vo.getReplyToContent() == null ? "" : vo.getReplyToContent());
            payload.put("replyToMsgType", vo.getReplyToMsgType() == null ? 0 : vo.getReplyToMsgType());
            payload.put("replyToNickname", vo.getReplyToNickname() == null ? "" : vo.getReplyToNickname());
            payload.put("replyToRecalled", Boolean.TRUE.equals(vo.getReplyToRecalled()));
            payload.put("atAll", Boolean.TRUE.equals(m.getAtAll()));
            payload.put("mentionUserIds", vo.getMentionUserIds() == null ? List.of() : vo.getMentionUserIds());
            payload.put("mentionedMe", mentionedMe);
            payload.put("notificationAllowed", notificationAllowed);
            payload.put("burnAfterRead", Boolean.TRUE.equals(m.getBurnAfterRead()));
            payload.put("burnSeconds", m.getBurnSeconds());
            payload.put("burnReadAt", m.getBurnReadAt());
            payload.put("burnExpiresAt", m.getBurnExpiresAt());
            payload.put("autoDeleteExpiresAt", m.getAutoDeleteExpiresAt());
            payload.put("scheduledMessage", Boolean.TRUE.equals(m.getScheduledMessage()));
            String json = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(payload);
            redis.convertAndSend(RedisKeys.IM_PUSH_CHANNEL, json);
        } catch (Exception e) {
            log.warn("publish im push failed: {}", e.getMessage());
        }
    }

    private boolean importantNotificationAllowed(
            ImConversation conversation,
            ImConversationMember member,
            ImMessage message,
            boolean mentionMe,
            ImMessage replyTarget
    ) {
        if (!Boolean.TRUE.equals(member.getMute())) return true;
        if (conversation == null || conversation.getType() == null || conversation.getType() != 2) return false;
        if (Boolean.TRUE.equals(message.getAtAll())
                && (member.getImportantAtAll() == null || Boolean.TRUE.equals(member.getImportantAtAll()))) return true;
        if (mentionMe
                && (member.getImportantMentionMe() == null || Boolean.TRUE.equals(member.getImportantMentionMe()))) return true;
        if (replyTarget != null && member.getUserId() != null
                && member.getUserId().equals(replyTarget.getFromUserId())
                && (member.getImportantReplyMe() == null || Boolean.TRUE.equals(member.getImportantReplyMe()))) return true;
        if (isGroupAnnouncement(message)
                && (member.getImportantAnnouncement() == null || Boolean.TRUE.equals(member.getImportantAnnouncement()))) return true;
        if (member.getUserId() != null && message.getFromUserId() != null
                && parseFollowedMemberIds(member.getImportantFollowedMemberIds()).contains(message.getFromUserId())) return true;
        return false;
    }

    private boolean isGroupAnnouncement(ImMessage message) {
        if (message == null || message.getMsgType() == null || message.getMsgType() != 9) return false;
        String content = message.getContent() == null ? "" : message.getContent();
        return content.contains("公告") || content.contains("group_announcement");
    }

    private java.util.Set<Long> parseFollowedMemberIds(String raw) {
        java.util.Set<Long> ids = new java.util.HashSet<>();
        if (raw == null || raw.isBlank()) return ids;
        for (String token : raw.split(",")) {
            try { ids.add(Long.valueOf(token.trim())); }
            catch (Exception ignored) { }
        }
        return ids;
    }

    private void assertGroupOwnerOrAdmin(Long userId, Long conversationId, ImConversation conv) {
        ImConversationMember mine = memberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, userId)
                .last("LIMIT 1"));
        if (mine == null) {
            throw new BizException("你不在该群聊中");
        }
        Long ownerId = conv.getOwnerId();
        boolean isManager = (ownerId != null && ownerId.equals(userId))
                || "owner".equalsIgnoreCase(mine.getRole())
                || "admin".equalsIgnoreCase(mine.getRole());
        if (!isManager) {
            throw new BizException("仅群主或管理员可@全体成员");
        }
    }

    private List<Long> filterGroupMemberIds(Long conversationId, List<Long> rawIds, Long excludeUserId) {
        if (rawIds == null || rawIds.isEmpty()) {
            return List.of();
        }
        java.util.LinkedHashSet<Long> wanted = new java.util.LinkedHashSet<>();
        for (Long id : rawIds) {
            if (id == null || id.equals(excludeUserId)) continue;
            wanted.add(id);
        }
        if (wanted.isEmpty()) {
            return List.of();
        }
        List<ImConversationMember> members = memberMapper.selectList(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .in(ImConversationMember::getUserId, wanted));
        java.util.LinkedHashSet<Long> ok = new java.util.LinkedHashSet<>();
        for (ImConversationMember mem : members) {
            if (mem.getUserId() != null) ok.add(mem.getUserId());
        }
        return new ArrayList<>(ok);
    }

    private void publishRecallPush(ImMessage m, Long fromUserId, Long toUserId) {
        try {
            java.util.Map<String, Object> payload = new java.util.LinkedHashMap<>();
            payload.put("event", "recall");
            payload.put("cmd", "RECALL_MSG");
            payload.put("msgId", m.getMsgId() == null ? "" : m.getMsgId());
            payload.put("id", m.getMsgId() == null ? "" : m.getMsgId());
            payload.put("conversationId", m.getConversationId());
            payload.put("fromUserId", fromUserId);
            payload.put("toUserId", toUserId);
            payload.put("sendTime", System.currentTimeMillis());
            String json = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(payload);
            redis.convertAndSend(RedisKeys.IM_PUSH_CHANNEL, json);
        } catch (Exception e) {
            log.warn("publish recall push failed: {}", e.getMessage());
        }
    }

    /** 好友申请相关实时推送：request / accepted / rejected / became_friends */
    private void publishFriendPush(
            String action,
            Long toUserId,
            Long fromUserId,
            Long requestId,
            String message,
            String fromNickname,
            String fromAvatarUrl,
            Integer status
    ) {
        if (toUserId == null || toUserId <= 0) {
            return;
        }
        try {
            java.util.Map<String, Object> payload = new java.util.LinkedHashMap<>();
            payload.put("event", "friend_request");
            payload.put("action", action == null ? "" : action);
            payload.put("toUserId", toUserId);
            payload.put("fromUserId", fromUserId == null ? 0L : fromUserId);
            payload.put("requestId", requestId == null ? 0L : requestId);
            payload.put("message", message == null ? "" : message);
            payload.put("fromNickname", fromNickname == null ? "" : fromNickname);
            payload.put("fromAvatarUrl", fromAvatarUrl == null ? "" : fromAvatarUrl);
            payload.put("status", status == null ? 0 : status);
            payload.put("pendingCount", countPendingFriendRequests(toUserId));
            payload.put("sendTime", System.currentTimeMillis());
            String json = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(payload);
            redis.convertAndSend(RedisKeys.IM_PUSH_CHANNEL, json);
        } catch (Exception e) {
            log.warn("publish friend push failed: {}", e.getMessage());
        }
    }

    private static String esc(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static String jsonString(String s) {
        if (s == null) return "\"\"";
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r") + "\"";
    }

    public com.pulse.api.vo.GlobalSearchVO globalSearch(Long userId, String keyword) {
        if (!StringUtils.hasText(keyword)) {
            throw new BizException("请输入搜索关键词");
        }
        String q = keyword.trim();
        String qLower = q.toLowerCase(Locale.ROOT);

        // 搜索页也需要保证系统助手已经建立好友关系，否则直接从搜索入口无法命中它。
        fileTransferAssistantService.ensureForUser(userId);
        List<com.pulse.api.vo.GlobalSearchVO.ContactHit> contacts = new ArrayList<>();
        for (ContactVO c : listContacts(userId)) {
            String name = c.getDisplayName() == null ? c.getNickname() : c.getDisplayName();
            if (name == null) name = "";
            if (!name.toLowerCase(Locale.ROOT).contains(qLower)) {
                continue;
            }
            SysUser u = userMapper.selectById(c.getUserId());
            String subtitle = "";
            if (u != null) {
                if (StringUtils.hasText(u.getSignature())) {
                    subtitle = u.getSignature();
                } else if (StringUtils.hasText(u.getRegion())) {
                    subtitle = u.getRegion();
                }
            }
            contacts.add(com.pulse.api.vo.GlobalSearchVO.ContactHit.builder()
                    .userId(c.getUserId())
                    .nickname(name)
                    .avatarUrl(c.getAvatarUrl())
                    .online(c.getOnline())
                    .subtitle(subtitle)
                    .fileTransferAssistant(Boolean.TRUE.equals(c.getFileTransferAssistant()))
                    .build());
            if (contacts.size() >= 20) break;
        }

        List<com.pulse.api.vo.GlobalSearchVO.GroupHit> groups = new ArrayList<>();
        List<ImConversationMember> myMemberships = memberMapper.selectList(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getUserId, userId));
        java.util.HashSet<Long> myConvIds = new java.util.HashSet<>();
        for (ImConversationMember m : myMemberships) {
            if (m.getConversationId() != null) myConvIds.add(m.getConversationId());
        }
        if (!myConvIds.isEmpty()) {
            List<ImConversation> convs = conversationMapper.selectList(new LambdaQueryWrapper<ImConversation>()
                    .in(ImConversation::getId, myConvIds)
                    .eq(ImConversation::getType, 2));
            for (ImConversation c : convs) {
                String title = c.getTitle() == null ? "" : c.getTitle();
                if (!title.toLowerCase(Locale.ROOT).contains(qLower)) continue;
                Long count = memberMapper.selectCount(new LambdaQueryWrapper<ImConversationMember>()
                        .eq(ImConversationMember::getConversationId, c.getId()));
                groups.add(com.pulse.api.vo.GlobalSearchVO.GroupHit.builder()
                        .id(c.getId())
                        .title(title)
                        .avatarUrl(c.getAvatarUrl())
                        .memberCount(count == null ? 0 : count.intValue())
                        .build());
                if (groups.size() >= 20) break;
            }
        }

        List<com.pulse.api.vo.GlobalSearchVO.MessageHit> messages = new ArrayList<>();
        List<com.pulse.api.vo.GlobalSearchVO.ConversationHit> conversations = new ArrayList<>();
        if (!myConvIds.isEmpty()) {
            List<ImMessage> msgs = messageMapper.selectList(new LambdaQueryWrapper<ImMessage>()
                    .in(ImMessage::getConversationId, myConvIds)
                    .and(w -> w.isNull(ImMessage::getRecalled).or().eq(ImMessage::getRecalled, false))
                    .like(ImMessage::getContent, q)
                    .orderByDesc(ImMessage::getSendTime)
                    .last("LIMIT 200"));
            msgs = msgs.stream()
                    .filter(message -> searchableMessageText(message)
                            .toLowerCase(Locale.ROOT)
                            .contains(qLower))
                    .collect(java.util.stream.Collectors.toList());
            java.util.Set<String> hidden = new java.util.HashSet<>();
            List<ImMessageHide> hides = messageHideMapper.selectList(new LambdaQueryWrapper<ImMessageHide>()
                    .eq(ImMessageHide::getUserId, userId));
            for (ImMessageHide h : hides) {
                if (h.getMsgId() != null) hidden.add(h.getMsgId());
            }
            Map<Long, ImConversation> convCache = new java.util.HashMap<>();
            Map<Long, SysUser> userCache = new java.util.HashMap<>();
            // conversationId -> 聚合（保持最近命中优先的插入顺序）
            java.util.LinkedHashMap<Long, int[]> countMap = new java.util.LinkedHashMap<>();
            java.util.LinkedHashMap<Long, ImMessage> latestMap = new java.util.LinkedHashMap<>();
            for (ImMessage m : msgs) {
                if (m.getConversationId() == null) continue;
                if (hidden.contains(m.getMsgId())) continue;
                Long cid = m.getConversationId();
                int[] cnt = countMap.get(cid);
                if (cnt == null) {
                    countMap.put(cid, new int[]{1});
                    latestMap.put(cid, m);
                } else {
                    cnt[0]++;
                }
            }
            for (Map.Entry<Long, int[]> e : countMap.entrySet()) {
                Long cid = e.getKey();
                ImMessage m = latestMap.get(cid);
                if (m == null) continue;
                ImConversation c = convCache.computeIfAbsent(cid, conversationMapper::selectById);
                if (c == null) continue;
                // 精确统计该会话内匹配条数（不受抽样 LIMIT 影响）
                LambdaQueryWrapper<ImMessage> countQw = new LambdaQueryWrapper<ImMessage>()
                        .eq(ImMessage::getConversationId, cid)
                        .and(w -> w.isNull(ImMessage::getRecalled).or().eq(ImMessage::getRecalled, false))
                        .like(ImMessage::getContent, q);
                OffsetDateTime histFrom = resolveHistoryFrom(userId, cid);
                if (histFrom != null) {
                    countQw.ge(ImMessage::getSendTime, histFrom);
                }
                Long exact = messageMapper.selectCount(countQw);
                int matchCount = exact == null ? e.getValue()[0] : Math.max(1, exact.intValue());
                String preview;
                int msgType = m.getMsgType() == null ? 0 : m.getMsgType();
                if (msgType == 4) {
                    preview = "[聊天记录]";
                } else if (msgType == 1) {
                    preview = "[图片]";
                } else if (msgType == 2) {
                    preview = isVideoMessageContent(m.getContent()) ? "[视频]" : "[文件]";
                } else if (msgType == 3) {
                    preview = "[语音]";
                } else if (msgType == 5) {
                    preview = "[名片]";
                } else if (msgType == 6) {
                    preview = "[位置]";
                } else if (msgType == 0) {
                    preview = m.getContent() == null ? "" : m.getContent();
                } else {
                    preview = previewOf(m);
                }
                String title = c.getTitle();
                String avatarUrl = c.getAvatarUrl();
                if (c.getType() != null && c.getType() == 1) {
                    // 私聊：标题与头像取对方
                    List<ImConversationMember> peers = memberMapper.selectList(new LambdaQueryWrapper<ImConversationMember>()
                            .eq(ImConversationMember::getConversationId, c.getId())
                            .eq(ImConversationMember::getUserId, userId)
                            .last("LIMIT 1"));
                    ImConversationMember mine = peers.isEmpty() ? null : peers.get(0);
                    if (mine != null && mine.getPeerUserId() != null) {
                        SysUser peer = resolveUser(mine.getPeerUserId(), userCache);
                        if (peer != null) {
                            if (StringUtils.hasText(peer.getNickname())) {
                                title = peer.getNickname();
                            }
                            // 单聊头像始终取对方当前资料，避免回退到会话里过期头像
                            avatarUrl = peer.getAvatarUrl();
                        }
                    }
                }
                SysUser from = resolveUser(m.getFromUserId(), userCache);
                conversations.add(com.pulse.api.vo.GlobalSearchVO.ConversationHit.builder()
                        .conversationId(c.getId())
                        .conversationTitle(StringUtils.hasText(title) ? title : "聊天")
                        .conversationType(c.getType())
                        .avatarUrl(avatarUrl)
                        .matchCount(matchCount)
                        .preview(preview)
                        .latestMsgId(m.getMsgId())
                        .latestMsgType(msgType)
                        .createdAt(m.getSendTime() == null ? null : m.getSendTime().toString())
                        .build());
                // 兼容旧字段：仍返回若干扁平消息
                if (messages.size() < 30) {
                    messages.add(com.pulse.api.vo.GlobalSearchVO.MessageHit.builder()
                            .msgId(m.getMsgId())
                            .conversationId(c.getId())
                            .conversationTitle(StringUtils.hasText(title) ? title : "聊天")
                            .conversationType(c.getType())
                            .fromNickname(displayNameOf(userId, from, m.getFromUserId()))
                            .content(preview)
                            .msgType(msgType)
                            .createdAt(m.getSendTime() == null ? null : m.getSendTime().toString())
                            .build());
                }
                if (conversations.size() >= 30) break;
            }
        }

        return com.pulse.api.vo.GlobalSearchVO.builder()
                .contacts(contacts)
                .groups(groups)
                .messages(messages)
                .conversations(conversations)
                .build();
    }

    public UserProfileVO getProfile(Long viewerId, Long targetId) {
        Long id = targetId != null ? targetId : viewerId;
        if (viewerId != null && targetId != null && !viewerId.equals(targetId)) {
            // 资料页可能被深链直接打开，不能依赖先访问联系人列表来补默认好友关系。
            defaultFriendService.ensureForUser(viewerId);
        }
        SysUser u = userMapper.selectById(id);
        if (u == null) {
            throw new BizException("用户不存在");
        }
        UserProfileVO vo = toProfile(u);
        vo.setDisplayName(displayNameService.displayName(viewerId, u, id));
        if (viewerId != null && targetId != null && !viewerId.equals(targetId)) {
            boolean blocked = isBlockedByMe(viewerId, targetId);
            boolean blockedByPeer = isBlockedByMe(targetId, viewerId);
            vo.setBlocked(blocked);
            vo.setBlockedByPeer(blockedByPeer);
            vo.setCommonGroupCount(countCommonGroups(viewerId, targetId));
            if (blocked) {
                vo.setFriendStatus("blocked");
                // 拉黑后仍保留本端好友行：备注 / 朋友圈权限可继续设置
                ImFriend rel = findFriend(viewerId, targetId);
                vo.setFriend(rel != null);
                if (rel != null) {
                    vo.setRemark(rel.getRemark());
                    vo.setTag(rel.getTag());
                    vo.setHideHisMoments(Boolean.TRUE.equals(rel.getHideHisMoments()));
                    vo.setRejectHisMoments(Boolean.TRUE.equals(rel.getRejectHisMoments()));
                    vo.setFriendAddSource(effectiveFriendAddSource(rel, targetId));
                    vo.setFriendAddInitiatorId(rel.getAddInitiatorId());
                    vo.setFriendSince(rel.getCreatedAt());
                }
            } else {
                // 被对方拉黑时，本端好友关系可仍保留：通讯录/资料按好友展示，仅标记 blockedByPeer
                boolean friend = isFriend(viewerId, targetId);
                vo.setFriend(friend);
                if (friend) {
                    vo.setFriendStatus("friend");
                    ImFriend rel = findFriend(viewerId, targetId);
                    if (rel != null) {
                        vo.setRemark(rel.getRemark());
                        vo.setTag(rel.getTag());
                        vo.setHideHisMoments(Boolean.TRUE.equals(rel.getHideHisMoments()));
                        vo.setRejectHisMoments(Boolean.TRUE.equals(rel.getRejectHisMoments()));
                        vo.setFriendAddSource(effectiveFriendAddSource(rel, targetId));
                        vo.setFriendAddInitiatorId(rel.getAddInitiatorId());
                        vo.setFriendSince(rel.getCreatedAt());
                    }
                } else if (blockedByPeer) {
                    vo.setFriendStatus("blocked_by_peer");
                } else {
                    ImFriendRequest sent = findPending(viewerId, targetId);
                    ImFriendRequest received = findPending(targetId, viewerId);
                    if (sent != null) {
                        vo.setFriendStatus("pending_sent");
                    } else if (received != null) {
                        vo.setFriendStatus("pending_received");
                    } else {
                        vo.setFriendStatus("none");
                    }
                }
            }
        } else {
            vo.setFriend(false);
            vo.setFriendStatus("none");
            vo.setBlocked(false);
            vo.setBlockedByPeer(false);
            vo.setCommonGroupCount(0);
            vo.setHideHisMoments(false);
            vo.setRejectHisMoments(false);
        }
        return vo;
    }

    /** 设置/修改好友备注 */
    @org.springframework.transaction.annotation.Transactional
    public void updateFriendRemark(Long userId, Long friendId, String remark) {
        ImFriend rel = requireFriendship(userId, friendId);
        if (defaultFriendService.isConfiguredDefaultFriend(friendId)) {
            throw new BizException("后台默认好友的备注不可修改");
        }
        rel.setRemark(trimTo(remark, 64));
        friendMapper.updateById(rel);
    }

    /** 仅当前仍在后台默认好友配置中的关系才算托管关系；兼容历史残留来源字段。 */
    private String effectiveFriendAddSource(ImFriend relation, Long friendId) {
        if (relation == null || !StringUtils.hasText(relation.getAddSource())) {
            return null;
        }
        if ("default_friend".equalsIgnoreCase(relation.getAddSource())
                && !defaultFriendService.isConfiguredDefaultFriend(friendId)) {
            return null;
        }
        return relation.getAddSource();
    }

    /** 更新朋友圈互看权限 */
    @org.springframework.transaction.annotation.Transactional
    public void updateFriendMomentsPermission(
            Long userId,
            Long friendId,
            Boolean hideHisMoments,
            Boolean rejectHisMoments
    ) {
        ImFriend rel = requireFriendship(userId, friendId);
        if (hideHisMoments != null) {
            rel.setHideHisMoments(hideHisMoments);
        }
        if (rejectHisMoments != null) {
            rel.setRejectHisMoments(rejectHisMoments);
        }
        friendMapper.updateById(rel);
    }

    private ImFriend requireFriendship(Long userId, Long friendId) {
        if (friendId == null || friendId.equals(userId)) {
            throw new BizException("无效的用户");
        }
        ImFriend rel = findFriend(userId, friendId);
        if (rel == null) {
            throw new BizException("对方不是你好友");
        }
        return rel;
    }

    private ImFriend findFriend(Long userId, Long friendId) {
        return friendMapper.selectOne(new LambdaQueryWrapper<ImFriend>()
                .eq(ImFriend::getUserId, userId)
                .eq(ImFriend::getFriendId, friendId)
                .last("LIMIT 1"));
    }

    public int countPendingFriendRequests(Long userId) {
        Long cnt = friendRequestMapper.selectCount(new LambdaQueryWrapper<ImFriendRequest>()
                .eq(ImFriendRequest::getToUserId, userId)
                .eq(ImFriendRequest::getStatus, 0));
        return cnt == null ? 0 : cnt.intValue();
    }

    public List<FriendRequestVO> listFriendRequests(Long userId) {
        List<ImFriendRequest> rows = friendRequestMapper.selectList(new LambdaQueryWrapper<ImFriendRequest>()
                .and(w -> w.eq(ImFriendRequest::getToUserId, userId)
                        .or()
                        .eq(ImFriendRequest::getFromUserId, userId))
                .orderByDesc(ImFriendRequest::getCreatedAt)
                .last("LIMIT 100"));
        List<FriendRequestVO> result = new ArrayList<>();
        for (ImFriendRequest r : rows) {
            boolean incoming = userId.equals(r.getToUserId());
            Long peerId = incoming ? r.getFromUserId() : r.getToUserId();
            SysUser peer = userMapper.selectById(peerId);
            if (peer == null) {
                continue;
            }
            result.add(FriendRequestVO.builder()
                    .id(r.getId())
                    .fromUserId(r.getFromUserId())
                    .toUserId(r.getToUserId())
                    .nickname(peer.getNickname())
                    .avatarUrl(peer.getAvatarUrl())
                    .message(r.getMessage())
                    .remark(r.getRemark())
                    .status(r.getStatus())
                    .direction(incoming ? "incoming" : "outgoing")
                    .createdAt(r.getCreatedAt())
                    .handledAt(r.getHandledAt())
                    .build());
        }
        result.sort(Comparator
                .comparing((FriendRequestVO v) -> v.getStatus() == null || v.getStatus() != 0)
                .thenComparing(FriendRequestVO::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())));
        return result;
    }

    /**
     * 发送好友申请。可填写验证信息与备注名。
     * @param source 添加来源：phone / pulse_id / group / qrcode / card / deleted_chat
     */
    @org.springframework.transaction.annotation.Transactional
    public void sendFriendRequest(Long userId, Long friendId, String message, String remark, String source) {
        sendFriendRequest(userId, friendId, message, remark, source, null);
    }

    @org.springframework.transaction.annotation.Transactional
    public void sendFriendRequest(
            Long userId, Long friendId, String message, String remark, String source, Long groupId) {
        if (friendId == null || friendId.equals(userId)) {
            throw new BizException("不能添加自己为好友");
        }
        SysUser target = userMapper.selectById(friendId);
        if (target == null) {
            throw new BizException("用户不存在");
        }
        assertCanRelate(userId, friendId);
        assertGroupFriendAllowed(userId, friendId, source, groupId);
        assertAddMethodAllowed(target, source);
        if (isFriend(userId, friendId)) {
            return;
        }
        String msg = trimTo(message, 128);
        String myRemark = trimTo(remark, 64);

        ImFriendRequest reverse = findPending(friendId, userId);
        if (reverse != null) {
            String src = StringUtils.hasText(reverse.getAddSource()) ? reverse.getAddSource() : source;
            becomeFriends(userId, friendId, myRemark, reverse.getRemark(), src, reverse.getFromUserId());
            reverse.setStatus(1);
            reverse.setHandledAt(OffsetDateTime.now());
            friendRequestMapper.updateById(reverse);
            SysUser me = userMapper.selectById(userId);
            publishFriendPush(
                    "accepted",
                    friendId,
                    userId,
                    reverse.getId(),
                    reverse.getMessage(),
                    me != null ? me.getNickname() : "",
                    me != null ? me.getAvatarUrl() : "",
                    1);
            publishFriendPush(
                    "became_friends",
                    userId,
                    friendId,
                    reverse.getId(),
                    null,
                    target.getNickname(),
                    target.getAvatarUrl(),
                    1);
            return;
        }

        // 对方关闭好友验证：直接成为好友
        if (!boolOrTrue(target.getFriendVerifyRequired())) {
            becomeFriends(userId, friendId, myRemark, null, source, userId);
            SysUser me = userMapper.selectById(userId);
            publishFriendPush(
                    "became_friends",
                    friendId,
                    userId,
                    null,
                    null,
                    me != null ? me.getNickname() : "",
                    me != null ? me.getAvatarUrl() : "",
                    1);
            publishFriendPush(
                    "became_friends",
                    userId,
                    friendId,
                    null,
                    null,
                    target.getNickname(),
                    target.getAvatarUrl(),
                    1);
            return;
        }

        ImFriendRequest existing = friendRequestMapper.selectOne(new LambdaQueryWrapper<ImFriendRequest>()
                .eq(ImFriendRequest::getFromUserId, userId)
                .eq(ImFriendRequest::getToUserId, friendId)
                .last("LIMIT 1"));
        SysUser from = userMapper.selectById(userId);
        String fromNick = from != null ? from.getNickname() : "";
        String fromAvatar = from != null ? from.getAvatarUrl() : "";
        String normalizedSource = normalizeAddSource(source);
        if (existing != null) {
            existing.setMessage(msg);
            existing.setRemark(myRemark);
            existing.setAddSource(normalizedSource);
            existing.setStatus(0);
            existing.setCreatedAt(OffsetDateTime.now());
            existing.setHandledAt(null);
            friendRequestMapper.updateById(existing);
            publishFriendPush("request", friendId, userId, existing.getId(), msg, fromNick, fromAvatar, 0);
            return;
        }

        ImFriendRequest req = new ImFriendRequest();
        req.setFromUserId(userId);
        req.setToUserId(friendId);
        req.setMessage(msg);
        req.setRemark(myRemark);
        req.setAddSource(normalizedSource);
        req.setStatus(0);
        req.setCreatedAt(OffsetDateTime.now());
        friendRequestMapper.insert(req);
        publishFriendPush("request", friendId, userId, req.getId(), msg, fromNick, fromAvatar, 0);
    }

    private void assertGroupFriendAllowed(Long userId, Long friendId, String source, Long groupId) {
        if (!"group".equals(normalizeAddSource(source))) {
            return;
        }
        if (groupId == null) {
            throw new BizException("缺少群聊来源");
        }
        ImConversation group = conversationMapper.selectById(groupId);
        if (group == null || group.getType() == null || group.getType() != 2) {
            throw new BizException("群聊不存在");
        }
        if (Boolean.FALSE.equals(group.getMemberFriendAllowed())) {
            throw new BizException("该群已禁止成员互加好友");
        }
        Long memberCount = memberMapper.selectCount(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, groupId)
                .in(ImConversationMember::getUserId, java.util.List.of(userId, friendId)));
        if (memberCount == null || memberCount < 2) {
            throw new BizException("你们已不在同一群聊");
        }
    }

    public void sendFriendRequest(Long userId, Long friendId, String message, String remark) {
        sendFriendRequest(userId, friendId, message, remark, null);
    }

    @org.springframework.transaction.annotation.Transactional
    public void acceptFriendRequest(Long userId, Long requestId, String remark) {
        ImFriendRequest req = friendRequestMapper.selectById(requestId);
        if (req == null || !userId.equals(req.getToUserId())) {
            throw new BizException("申请不存在");
        }
        if (req.getStatus() != null && req.getStatus() == 1) {
            return;
        }
        if (req.getStatus() != null && req.getStatus() != 0) {
            throw new BizException("该申请已处理");
        }
        assertCanRelate(userId, req.getFromUserId());
        String myRemark = trimTo(remark, 64);
        becomeFriends(
                userId,
                req.getFromUserId(),
                myRemark,
                req.getRemark(),
                req.getAddSource(),
                req.getFromUserId());
        req.setStatus(1);
        req.setHandledAt(OffsetDateTime.now());
        friendRequestMapper.updateById(req);
        try {
            ConversationVO conversation = conversationService.getOrCreatePrivate(userId, req.getFromUserId());
            sendTextMessage(
                    userId,
                    conversation.getId(),
                    req.getFromUserId(),
                    "我通过了你的好友请求，现在可以开始聊天了！",
                    "friend_accept_greeting_" + req.getId(),
                    null);
        } catch (Exception e) {
            // 好友关系已经建立，欢迎消息失败不应回滚通过操作。
            log.warn("send friend acceptance greeting failed: {}", e.getMessage());
        }
        SysUser me = userMapper.selectById(userId);
        publishFriendPush(
                "accepted",
                req.getFromUserId(),
                userId,
                req.getId(),
                req.getMessage(),
                me != null ? me.getNickname() : "",
                me != null ? me.getAvatarUrl() : "",
                1);
    }

    @org.springframework.transaction.annotation.Transactional
    public void rejectFriendRequest(Long userId, Long requestId) {
        ImFriendRequest req = friendRequestMapper.selectById(requestId);
        if (req == null || !userId.equals(req.getToUserId())) {
            throw new BizException("申请不存在");
        }
        if (req.getStatus() != null && req.getStatus() != 0) {
            return;
        }
        req.setStatus(2);
        req.setHandledAt(OffsetDateTime.now());
        friendRequestMapper.updateById(req);
        SysUser me = userMapper.selectById(userId);
        publishFriendPush(
                "rejected",
                req.getFromUserId(),
                userId,
                req.getId(),
                req.getMessage(),
                me != null ? me.getNickname() : "",
                me != null ? me.getAvatarUrl() : "",
                2);
    }

    /** 兼容旧接口：改为发送好友申请 */
    @org.springframework.transaction.annotation.Transactional
    public void addFriend(Long userId, Long friendId) {
        sendFriendRequest(userId, friendId, null, null);
    }

    /** 删除好友（双向解除），对本端隐藏会话并单向清空历史记录 */
    @org.springframework.transaction.annotation.Transactional
    public void deleteFriend(Long userId, Long friendId) {
        if (friendId == null || friendId.equals(userId)) {
            throw new BizException("无效的用户");
        }
        if (defaultFriendService.isConfiguredDefaultFriend(friendId)) {
            throw new BizException("平台客服不可被拉黑或者删除");
        }
        removeFriendshipAndHideChat(userId, friendId, true, true, "delete", true);
    }

    /** 拉黑：加入黑名单并隐藏本端会话；保留好友关系，备注与朋友圈权限仍可设置 */
    @org.springframework.transaction.annotation.Transactional
    public void blockUser(Long userId, Long targetUserId) {
        if (targetUserId == null || targetUserId.equals(userId)) {
            throw new BizException("无效的用户");
        }
        if (defaultFriendService.isConfiguredDefaultFriend(targetUserId)) {
            throw new BizException("平台客服不可被拉黑或者删除");
        }
        SysUser target = userMapper.selectById(targetUserId);
        if (target == null) {
            throw new BizException("用户不存在");
        }
        if (!isBlockedByMe(userId, targetUserId)) {
            ImFriend rel = findFriend(userId, targetUserId);
            ImUserBlock row = new ImUserBlock();
            row.setUserId(userId);
            row.setBlockedUserId(targetUserId);
            if (rel != null && StringUtils.hasText(rel.getRemark())) {
                row.setRemark(trimTo(rel.getRemark(), 64));
            }
            row.setCreatedAt(OffsetDateTime.now());
            userBlockMapper.insert(row);
        }
        // 保留/补齐被拉黑方对本端的好友行，通讯录仍可见拉黑方
        ensureMutualFriendship(userId, targetUserId);
        hidePrivateConversation(userId, targetUserId, false);
    }

    /** 解除拉黑（好友关系仍在；会话重新可见） */
    @org.springframework.transaction.annotation.Transactional
    public void unblockUser(Long userId, Long targetUserId) {
        if (targetUserId == null || targetUserId.equals(userId)) {
            throw new BizException("无效的用户");
        }
        userBlockMapper.delete(new LambdaQueryWrapper<ImUserBlock>()
                .eq(ImUserBlock::getUserId, userId)
                .eq(ImUserBlock::getBlockedUserId, targetUserId));
        ImConversationMember mine = memberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getUserId, userId)
                .eq(ImConversationMember::getPeerUserId, targetUserId)
                .last("LIMIT 1"));
        if (mine != null && Boolean.TRUE.equals(mine.getHidden())) {
            mine.setHidden(false);
            memberMapper.updateById(mine);
        }
        // 历史拉黑曾删好友行：取消拉黑后补齐双向好友，避免被拉黑方显示「不是好友」
        restoreFriendshipAfterUnblock(userId, targetUserId);
    }

    public List<ContactVO> listBlockedUsers(Long userId) {
        List<ImUserBlock> rows = userBlockMapper.selectList(new LambdaQueryWrapper<ImUserBlock>()
                .eq(ImUserBlock::getUserId, userId)
                .orderByDesc(ImUserBlock::getCreatedAt));
        List<ContactVO> result = new ArrayList<>();
        for (ImUserBlock b : rows) {
            SysUser u = userMapper.selectById(b.getBlockedUserId());
            if (u == null) {
                continue;
            }
            ensurePulseId(u);
            String nickname = u.getNickname();
            String remark = b.getRemark();
            String displayName = displayNameService.displayName(userId, u, u.getId());
            result.add(ContactVO.builder()
                    .userId(u.getId())
                    .pulseId(u.getPulseId())
                    .nickname(nickname)
                    .displayName(displayName)
                    .avatarUrl(u.getAvatarUrl())
                    .online(false)
                    .letter(letterOf(StringUtils.hasText(remark) ? remark : nickname))
                    .remark(remark)
                    .build());
        }
        return result;
    }

    public List<CommonGroupVO> listCommonGroups(Long userId, Long peerUserId) {
        if (peerUserId == null || peerUserId.equals(userId)) {
            return List.of();
        }
        List<ImConversationMember> mine = memberMapper.selectList(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getUserId, userId));
        Set<Long> myConvIds = new HashSet<>();
        for (ImConversationMember m : mine) {
            if (m.getConversationId() != null) {
                myConvIds.add(m.getConversationId());
            }
        }
        if (myConvIds.isEmpty()) {
            return List.of();
        }
        List<ImConversationMember> peer = memberMapper.selectList(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getUserId, peerUserId)
                .in(ImConversationMember::getConversationId, myConvIds));
        Set<Long> commonIds = new HashSet<>();
        for (ImConversationMember m : peer) {
            if (m.getConversationId() != null) {
                commonIds.add(m.getConversationId());
            }
        }
        if (commonIds.isEmpty()) {
            return List.of();
        }
        List<ImConversation> groups = conversationMapper.selectList(new LambdaQueryWrapper<ImConversation>()
                .in(ImConversation::getId, commonIds)
                .eq(ImConversation::getType, 2)
                .orderByDesc(ImConversation::getUpdatedAt));
        List<CommonGroupVO> result = new ArrayList<>();
        for (ImConversation g : groups) {
            Long cnt = memberMapper.selectCount(new LambdaQueryWrapper<ImConversationMember>()
                    .eq(ImConversationMember::getConversationId, g.getId()));
            result.add(CommonGroupVO.builder()
                    .id(g.getId())
                    .title(StringUtils.hasText(g.getTitle()) ? g.getTitle() : "群聊")
                    .avatarUrl(g.getAvatarUrl())
                    .memberCount(cnt == null ? 0 : cnt.intValue())
                    .build());
        }
        return result;
    }

    private int countCommonGroups(Long userId, Long peerUserId) {
        return listCommonGroups(userId, peerUserId).size();
    }

    private void hidePrivateConversation(Long userId, Long peerId, boolean clearMessages) {
        ImConversationMember mineMember = memberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getUserId, userId)
                .eq(ImConversationMember::getPeerUserId, peerId)
                .last("LIMIT 1"));
        if (mineMember == null) {
            return;
        }
        Long convId = mineMember.getConversationId();
        if (clearMessages && convId != null) {
            messageHideMapper.hideAllInConversation(userId, convId);
        }
        mineMember.setHidden(true);
        mineMember.setUnreadCount(0);
        memberMapper.updateById(mineMember);
    }

    private void removeFriendshipAndHideChat(
            Long userId,
            Long friendId,
            boolean hideMine,
            boolean clearMessages,
            String reason,
            boolean removePeerFriendship
    ) {
        ImFriend mine = findFriend(userId, friendId);
        ImFriend peer = findFriend(friendId, userId);
        if (mine != null || peer != null) {
            recordFriendDeleteLog(userId, friendId, mine != null ? mine : peer, reason);
        }
        friendMapper.delete(new LambdaQueryWrapper<ImFriend>()
                .eq(ImFriend::getUserId, userId)
                .eq(ImFriend::getFriendId, friendId));
        if (removePeerFriendship) {
            friendMapper.delete(new LambdaQueryWrapper<ImFriend>()
                    .eq(ImFriend::getUserId, friendId)
                    .eq(ImFriend::getFriendId, userId));
        }
        friendRequestMapper.delete(new LambdaQueryWrapper<ImFriendRequest>()
                .and(w -> w
                        .and(a -> a.eq(ImFriendRequest::getFromUserId, userId).eq(ImFriendRequest::getToUserId, friendId))
                        .or(b -> b.eq(ImFriendRequest::getFromUserId, friendId).eq(ImFriendRequest::getToUserId, userId))));
        if (!hideMine) {
            return;
        }
        ImConversationMember mineMember = memberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getUserId, userId)
                .eq(ImConversationMember::getPeerUserId, friendId)
                .last("LIMIT 1"));
        if (mineMember != null) {
            Long convId = mineMember.getConversationId();
            // 仅「删除好友」清空本端历史；拉黑只隐藏会话
            if (clearMessages && convId != null) {
                messageHideMapper.hideAllInConversation(userId, convId);
            }
            mineMember.setHidden(true);
            mineMember.setUnreadCount(0);
            memberMapper.updateById(mineMember);
        }
    }

    private void recordFriendDeleteLog(Long operatorId, Long peerId, ImFriend relation, String reason) {
        try {
            ImFriendDeleteLog row = new ImFriendDeleteLog();
            row.setUserId(operatorId);
            row.setFriendId(peerId);
            if (relation != null) {
                row.setAddSource(relation.getAddSource());
                row.setAddInitiatorId(relation.getAddInitiatorId());
                row.setFriendSince(relation.getCreatedAt());
            }
            row.setReason(StringUtils.hasText(reason) ? reason : "delete");
            row.setDeletedAt(OffsetDateTime.now());
            friendDeleteLogMapper.insert(row);
        } catch (Exception e) {
            log.warn("write friend delete log failed: {}", e.getMessage());
        }
    }

    private void assertCanRelate(Long userId, Long peerId) {
        if (isBlockedByMe(userId, peerId)) {
            throw new BizException("已拉黑对方，请先移出黑名单");
        }
        if (isBlockedByMe(peerId, userId)) {
            throw new BizException("您已被对方拉入黑名单");
        }
    }

    private boolean isBlockedByMe(Long userId, Long peerId) {
        if (userId == null || peerId == null) {
            return false;
        }
        Long cnt = userBlockMapper.selectCount(new LambdaQueryWrapper<ImUserBlock>()
                .eq(ImUserBlock::getUserId, userId)
                .eq(ImUserBlock::getBlockedUserId, peerId));
        return cnt != null && cnt > 0;
    }

    private boolean isBlockedEitherWay(Long userA, Long userB) {
        return isBlockedByMe(userA, userB) || isBlockedByMe(userB, userA);
    }

    /** 我拉黑的用户（不含「拉黑我的人」） */
    private Set<Long> blockedByMeIds(Long userId) {
        Set<Long> ids = new HashSet<>();
        List<ImUserBlock> asBlocker = userBlockMapper.selectList(new LambdaQueryWrapper<ImUserBlock>()
                .eq(ImUserBlock::getUserId, userId));
        for (ImUserBlock b : asBlocker) {
            if (b.getBlockedUserId() != null) {
                ids.add(b.getBlockedUserId());
            }
        }
        return ids;
    }

    public UserProfileVO getProfileByPulseId(Long viewerId, String pulseId) {
        if (!StringUtils.hasText(pulseId)) {
            throw new BizException("PulseID 无效");
        }
        String pid = pulseId.trim();
        SysUser u = userMapper.selectOne(new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getPulseId, pid)
                .last("LIMIT 1"));
        if (u == null && pid.matches("\\d{7}")) {
            // 兼容：旧数据尚未回填时，按 1000000+id 反查
            try {
                long num = Long.parseLong(pid);
                if (num >= 1_000_001L) {
                    u = userMapper.selectById(num - 1_000_000L);
                }
            } catch (NumberFormatException ignored) {
                // ignore
            }
        }
        if (u == null) {
            throw new BizException("用户不存在");
        }
        return getProfile(viewerId, u.getId());
    }

    private void assertGroupCanSpeak(Long userId, Long conversationId, ImConversation conv) {
        ImConversationMember mine = memberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, userId)
                .last("LIMIT 1"));
        if (mine == null) {
            throw new BizException("你不在该群聊中");
        }
        Long ownerId = conv.getOwnerId();
        boolean isManager = (ownerId != null && ownerId.equals(userId))
                || "owner".equalsIgnoreCase(mine.getRole())
                || "admin".equalsIgnoreCase(mine.getRole());
        if (isManager) {
            return;
        }
        if (Boolean.TRUE.equals(conv.getMuteAll())) {
            throw new BizException("全员禁言中，仅群主和管理员可发言");
        }
        if (Boolean.TRUE.equals(mine.getSpeakMuted())) {
            throw new BizException("你已被禁言");
        }
    }

    private boolean isFriend(Long userId, Long friendId) {
        Long cnt = friendMapper.selectCount(new LambdaQueryWrapper<ImFriend>()
                .eq(ImFriend::getUserId, userId)
                .eq(ImFriend::getFriendId, friendId));
        return cnt != null && cnt > 0;
    }

    /**
     * 若任一侧仍有好友行，则补齐另一侧（对方未主动删友时）。
     * 用于拉黑保留好友、取消拉黑后避免单边好友导致资料页显示「不是好友」。
     */
    private void ensureMutualFriendship(Long userA, Long userB) {
        if (userA == null || userB == null || userA.equals(userB)) {
            return;
        }
        ImFriend a2b = findFriend(userA, userB);
        ImFriend b2a = findFriend(userB, userA);
        if (a2b != null && b2a != null) {
            return;
        }
        if (a2b != null && b2a == null && !hasExplicitFriendDelete(userB, userA)) {
            upsertFriend(userB, userA, null, a2b.getAddSource(), a2b.getAddInitiatorId(), a2b.getCreatedAt());
        } else if (b2a != null && a2b == null && !hasExplicitFriendDelete(userA, userB)) {
            upsertFriend(userA, userB, null, b2a.getAddSource(), b2a.getAddInitiatorId(), b2a.getCreatedAt());
        }
    }

    /** 取消拉黑：补齐单边好友；若两侧都缺但历史仅因拉黑解除，则按删友审计恢复双向 */
    private void restoreFriendshipAfterUnblock(Long blockerId, Long blockedId) {
        ensureMutualFriendship(blockerId, blockedId);
        if (isFriend(blockerId, blockedId) || isFriend(blockedId, blockerId)) {
            return;
        }
        if (hasExplicitFriendDelete(blockerId, blockedId) || hasExplicitFriendDelete(blockedId, blockerId)) {
            return;
        }
        ImFriendDeleteLog blockLog = friendDeleteLogMapper.selectOne(new LambdaQueryWrapper<ImFriendDeleteLog>()
                .eq(ImFriendDeleteLog::getUserId, blockerId)
                .eq(ImFriendDeleteLog::getFriendId, blockedId)
                .eq(ImFriendDeleteLog::getReason, "block")
                .orderByDesc(ImFriendDeleteLog::getDeletedAt)
                .last("LIMIT 1"));
        if (blockLog == null) {
            return;
        }
        OffsetDateTime since = blockLog.getFriendSince() != null ? blockLog.getFriendSince() : blockLog.getDeletedAt();
        upsertFriend(blockerId, blockedId, null, blockLog.getAddSource(), blockLog.getAddInitiatorId(), since);
        upsertFriend(blockedId, blockerId, null, blockLog.getAddSource(), blockLog.getAddInitiatorId(), since);
    }

    private boolean hasExplicitFriendDelete(Long userId, Long friendId) {
        if (userId == null || friendId == null) {
            return false;
        }
        Long cnt = friendDeleteLogMapper.selectCount(new LambdaQueryWrapper<ImFriendDeleteLog>()
                .eq(ImFriendDeleteLog::getUserId, userId)
                .eq(ImFriendDeleteLog::getFriendId, friendId)
                .eq(ImFriendDeleteLog::getReason, "delete"));
        return cnt != null && cnt > 0;
    }

    private ImFriendRequest findPending(Long fromUserId, Long toUserId) {
        return friendRequestMapper.selectOne(new LambdaQueryWrapper<ImFriendRequest>()
                .eq(ImFriendRequest::getFromUserId, fromUserId)
                .eq(ImFriendRequest::getToUserId, toUserId)
                .eq(ImFriendRequest::getStatus, 0)
                .last("LIMIT 1"));
    }

    private void becomeFriends(
            Long userA,
            Long userB,
            String remarkForBOnA,
            String remarkForAOnB,
            String addSource,
            Long initiatorId) {
        String src = normalizeAddSource(addSource);
        Long initiator = initiatorId != null ? initiatorId : userA;
        OffsetDateTime now = OffsetDateTime.now();
        upsertFriend(userA, userB, remarkForBOnA, src, initiator, now);
        upsertFriend(userB, userA, remarkForAOnB, src, initiator, now);
        try {
            conversationService.getOrCreatePrivate(userA, userB);
        } catch (Exception e) {
            log.warn("create private conversation after friend accept failed: {}", e.getMessage());
        }
    }

    private void upsertFriend(
            Long userId,
            Long friendId,
            String remark,
            String addSource,
            Long initiatorId,
            OffsetDateTime since) {
        ImFriend existing = friendMapper.selectOne(new LambdaQueryWrapper<ImFriend>()
                .eq(ImFriend::getUserId, userId)
                .eq(ImFriend::getFriendId, friendId)
                .last("LIMIT 1"));
        if (existing != null) {
            boolean changed = false;
            if (StringUtils.hasText(remark) && !StringUtils.hasText(existing.getRemark())) {
                existing.setRemark(remark);
                changed = true;
            }
            if (!StringUtils.hasText(existing.getAddSource()) && StringUtils.hasText(addSource)) {
                existing.setAddSource(addSource);
                changed = true;
            }
            if (existing.getAddInitiatorId() == null && initiatorId != null) {
                existing.setAddInitiatorId(initiatorId);
                changed = true;
            }
            if (changed) {
                friendMapper.updateById(existing);
            }
            return;
        }
        ImFriend f = new ImFriend();
        f.setUserId(userId);
        f.setFriendId(friendId);
        f.setRemark(StringUtils.hasText(remark) ? remark : null);
        f.setAddSource(addSource);
        f.setAddInitiatorId(initiatorId);
        f.setCreatedAt(since != null ? since : OffsetDateTime.now());
        friendMapper.insert(f);
    }

    private String normalizeAddSource(String source) {
        if (!StringUtils.hasText(source)) {
            return null;
        }
        String s = source.trim().toLowerCase();
        return switch (s) {
            case "phone" -> "phone";
            case "pulse_id", "id", "pulseid" -> "pulse_id";
            case "group" -> "group";
            case "qrcode", "qr" -> "qrcode";
            case "card" -> "card";
            case "deleted_chat", "deleted" -> "deleted_chat";
            default -> s.length() > 32 ? s.substring(0, 32) : s;
        };
    }

    private String trimTo(String raw, int max) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        String s = raw.trim();
        if (s.isEmpty()) {
            return null;
        }
        return s.length() > max ? s.substring(0, max) : s;
    }

    public UserProfileVO updateProfile(Long userId, Map<String, Object> body) {
        SysUser u = userMapper.selectById(userId);
        if (u == null) {
            throw new BizException("用户不存在");
        }
        if (body.get("nickname") != null) {
            u.setNickname(nicknameConfigService.normalizeUserNickname(String.valueOf(body.get("nickname"))));
        }
        if (body.get("avatarUrl") != null) {
            String avatar = String.valueOf(body.get("avatarUrl"));
            if (!avatar.startsWith("data:") && avatar.length() <= 512) {
                u.setAvatarUrl(avatar);
            }
        }
        if (body.get("momentsCoverUrl") != null) {
            String cover = String.valueOf(body.get("momentsCoverUrl")).trim();
            if (cover.isEmpty() || "null".equalsIgnoreCase(cover)) {
                u.setMomentsCoverUrl(null);
            } else if (!cover.startsWith("data:") && cover.length() <= 512) {
                u.setMomentsCoverUrl(cover);
            }
        }
        if (body.get("gender") != null) {
            u.setGender(String.valueOf(body.get("gender")));
        }
        if (body.get("birthday") != null && StringUtils.hasText(String.valueOf(body.get("birthday")))) {
            u.setBirthday(LocalDate.parse(String.valueOf(body.get("birthday"))));
        }
        if (body.get("region") != null) {
            u.setRegion(String.valueOf(body.get("region")));
        }
        if (body.get("signature") != null) {
            u.setSignature(String.valueOf(body.get("signature")));
        }
        u.setUpdatedAt(OffsetDateTime.now());
        userMapper.updateById(u);
        return toProfile(u);
    }

    public UserProfileVO searchByPhone(String phone) {
        if (!StringUtils.hasText(phone)) {
            return null;
        }
        String q = phone.trim();
        SysUser u = userMapper.selectOne(new LambdaQueryWrapper<SysUser>().eq(SysUser::getPhone, q));
        if (u != null) {
            if (!boolOrTrue(u.getSearchByPhone())) {
                return null;
            }
            return toProfile(u);
        }
        if (q.matches("\\d{7}")) {
            u = userMapper.selectOne(new LambdaQueryWrapper<SysUser>().eq(SysUser::getPulseId, q).last("LIMIT 1"));
            if (u != null) {
                if (!boolOrTrue(u.getSearchByPulseId())) {
                    return null;
                }
                return toProfile(u);
            }
        }
        return null;
    }

    public PrivacySettingsVO getPrivacySettings(Long userId) {
        SysUser u = userMapper.selectById(userId);
        if (u == null) {
            throw new BizException("用户不存在");
        }
        return toPrivacySettings(u);
    }

    @org.springframework.transaction.annotation.Transactional
    public PrivacySettingsVO updatePrivacySettings(Long userId, Map<String, Object> body) {
        SysUser u = userMapper.selectById(userId);
        if (u == null) {
            throw new BizException("用户不存在");
        }
        if (body == null) {
            return toPrivacySettings(u);
        }
        if (body.containsKey("friendVerifyRequired")) {
            u.setFriendVerifyRequired(parseBool(body.get("friendVerifyRequired"), true));
        }
        if (body.containsKey("groupInviteVerify")) {
            u.setGroupInviteVerify(parseBool(body.get("groupInviteVerify"), false));
        }
        if (body.containsKey("addByPhone")) {
            u.setAddByPhone(parseBool(body.get("addByPhone"), true));
        }
        if (body.containsKey("addByPulseId")) {
            u.setAddByPulseId(parseBool(body.get("addByPulseId"), true));
        }
        if (body.containsKey("addByGroup")) {
            u.setAddByGroup(parseBool(body.get("addByGroup"), true));
        }
        if (body.containsKey("addByQrcode")) {
            u.setAddByQrcode(parseBool(body.get("addByQrcode"), true));
        }
        if (body.containsKey("addByCard")) {
            u.setAddByCard(parseBool(body.get("addByCard"), true));
        }
        if (body.containsKey("addByDeletedChat")) {
            u.setAddByDeletedChat(parseBool(body.get("addByDeletedChat"), true));
        }
        if (body.containsKey("searchByPhone")) {
            u.setSearchByPhone(parseBool(body.get("searchByPhone"), true));
        }
        if (body.containsKey("searchByPulseId")) {
            u.setSearchByPulseId(parseBool(body.get("searchByPulseId"), true));
        }
        if (body.containsKey("momentsVisibleRange")) {
            u.setMomentsVisibleRange(normalizeMomentsRange(String.valueOf(body.get("momentsVisibleRange"))));
        }
        if (body.containsKey("momentsStrangerTen")) {
            u.setMomentsStrangerTen(parseBool(body.get("momentsStrangerTen"), false));
        }
        if (body.containsKey("hideOnlineStatus")) {
            u.setHideOnlineStatus(parseBool(body.get("hideOnlineStatus"), false));
        }
        if (body.containsKey("readReceiptEnabled")) {
            u.setReadReceiptEnabled(parseBool(body.get("readReceiptEnabled"), true));
        }
        if (body.containsKey("typingStatusEnabled")) {
            u.setTypingStatusEnabled(parseBool(body.get("typingStatusEnabled"), true));
        }
        u.setUpdatedAt(OffsetDateTime.now());
        userMapper.updateById(u);
        return toPrivacySettings(u);
    }

    private PrivacySettingsVO toPrivacySettings(SysUser u) {
        return PrivacySettingsVO.builder()
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
                .momentsVisibleRange(normalizeMomentsRange(u.getMomentsVisibleRange()))
                .momentsStrangerTen(Boolean.TRUE.equals(u.getMomentsStrangerTen()))
                .hideOnlineStatus(Boolean.TRUE.equals(u.getHideOnlineStatus()))
                .readReceiptEnabled(u.getReadReceiptEnabled() == null || Boolean.TRUE.equals(u.getReadReceiptEnabled()))
                .typingStatusEnabled(u.getTypingStatusEnabled() == null || Boolean.TRUE.equals(u.getTypingStatusEnabled()))
                .build();
    }

    private void assertAddMethodAllowed(SysUser target, String source) {
        if (target == null || !StringUtils.hasText(source)) {
            return;
        }
        String s = source.trim().toLowerCase();
        boolean allowed = switch (s) {
            case "phone" -> boolOrTrue(target.getAddByPhone());
            case "pulse_id", "id", "pulseid" -> boolOrTrue(target.getAddByPulseId());
            case "group" -> boolOrTrue(target.getAddByGroup());
            case "qrcode", "qr" -> boolOrTrue(target.getAddByQrcode());
            case "card" -> boolOrTrue(target.getAddByCard());
            case "deleted_chat", "deleted" -> boolOrTrue(target.getAddByDeletedChat());
            default -> true;
        };
        if (!allowed) {
            String tip = switch (s) {
                case "phone" -> "对方关闭了通过手机号添加";
                case "pulse_id", "id", "pulseid" -> "对方关闭了通过 ID 添加";
                case "group" -> "对方关闭了通过群聊添加";
                case "qrcode", "qr" -> "对方关闭了通过二维码添加";
                case "card" -> "对方关闭了通过名片添加";
                case "deleted_chat", "deleted" -> "对方关闭了通过聊天记录添加";
                default -> "对方已关闭此添加方式";
            };
            throw new BizException(tip);
        }
    }

    private static boolean boolOrTrue(Boolean v) {
        return v == null || Boolean.TRUE.equals(v);
    }

    private static boolean parseBool(Object raw, boolean defaultVal) {
        if (raw == null) {
            return defaultVal;
        }
        if (raw instanceof Boolean b) {
            return b;
        }
        String s = String.valueOf(raw).trim();
        if ("true".equalsIgnoreCase(s) || "1".equals(s)) {
            return true;
        }
        if ("false".equalsIgnoreCase(s) || "0".equals(s)) {
            return false;
        }
        return defaultVal;
    }

    private UserProfileVO toProfile(SysUser u) {
        ensurePulseId(u);
        return UserProfileVO.builder()
                .userId(u.getId())
                .pulseId(u.getPulseId())
                .nickname(u.getNickname())
                .displayName(u.getNickname())
                .avatarUrl(u.getAvatarUrl())
                .momentsCoverUrl(u.getMomentsCoverUrl())
                .gender(u.getGender())
                .birthday(u.getBirthday())
                .region(u.getRegion())
                .signature(u.getSignature())
                .phone(u.getPhone())
                .fileTransferAssistant(Boolean.TRUE.equals(u.getFileTransferAssistant()))
                .build();
    }

    private void ensurePulseId(SysUser u) {
        identityAllocator.ensurePulseId(u);
    }

    private String letterOf(String name) {
        if (!StringUtils.hasText(name)) {
            return "#";
        }
        char c = Character.toUpperCase(name.charAt(0));
        if (c >= 'A' && c <= 'Z') {
            return String.valueOf(c);
        }
        return "#";
    }

    public List<MomentVO> listMoments(Long viewerId) {
        java.util.Set<Long> friendIds = friendIdsOf(viewerId);
        java.util.Set<Long> circleUserIds = new java.util.HashSet<>(friendIds);
        circleUserIds.add(viewerId);

        List<MomentPost> posts = new ArrayList<>();
        if (!circleUserIds.isEmpty()) {
            posts.addAll(momentPostMapper.selectList(new LambdaQueryWrapper<MomentPost>()
                    .in(MomentPost::getUserId, circleUserIds)
                    .and(w -> w.isNull(MomentPost::getRemoved).or().eq(MomentPost::getRemoved, false))
                    .orderByDesc(MomentPost::getCreatedAt)
                    .last("LIMIT 120")));
        }
        posts.sort((a, b) -> {
            OffsetDateTime ta = a.getCreatedAt();
            OffsetDateTime tb = b.getCreatedAt();
            if (ta == null && tb == null) return 0;
            if (ta == null) return 1;
            if (tb == null) return -1;
            return tb.compareTo(ta);
        });

        java.util.Map<Long, OffsetDateTime> authorRangeStart = new java.util.HashMap<>();
        List<MomentVO> list = new ArrayList<>();
        java.util.Set<Long> seen = new java.util.HashSet<>();
        for (MomentPost p : posts) {
            if (p.getId() != null && !seen.add(p.getId())) continue;
            if (p.getUserId() != null && !p.getUserId().equals(viewerId)) {
                OffsetDateTime rangeStart = authorRangeStart.computeIfAbsent(p.getUserId(), id -> {
                    SysUser author = userMapper.selectById(id);
                    return author == null ? null : momentsRangeStart(author.getMomentsVisibleRange());
                });
                if (rangeStart != null && (p.getCreatedAt() == null || p.getCreatedAt().isBefore(rangeStart))) {
                    continue;
                }
            }
            if (!canViewMoment(p, viewerId, friendIds)) continue;
            try {
                list.add(toMomentVO(p, viewerId));
            } catch (Exception e) {
                log.warn("skip broken moment id={}: {}", p.getId(), e.getMessage());
            }
            if (list.size() >= 50) break;
        }
        return list;
    }

    /** 查看指定用户的朋友圈（按可见性过滤；拉黑后不可见） */
    public List<MomentVO> listUserMoments(Long viewerId, Long targetUserId) {
        if (targetUserId == null) {
            return List.of();
        }
        if (viewerId != null && !viewerId.equals(targetUserId) && isBlockedEitherWay(viewerId, targetUserId)) {
            return List.of();
        }
        if (viewerId != null && !viewerId.equals(targetUserId) && isHideHisMoments(viewerId, targetUserId)) {
            return List.of();
        }
        SysUser target = userMapper.selectById(targetUserId);
        if (target == null) {
            throw new BizException("用户不存在");
        }
        java.util.Set<Long> friendIds = friendIdsOf(viewerId);
        boolean isSelf = viewerId != null && viewerId.equals(targetUserId);
        boolean isFriend = friendIds.contains(targetUserId);
        boolean strangerTen = Boolean.TRUE.equals(target.getMomentsStrangerTen());
        if (!isSelf && !isFriend && !strangerTen) {
            return List.of();
        }
        List<MomentPost> posts = momentPostMapper.selectList(new LambdaQueryWrapper<MomentPost>()
                .eq(MomentPost::getUserId, targetUserId)
                .and(w -> w.isNull(MomentPost::getRemoved).or().eq(MomentPost::getRemoved, false))
                .orderByDesc(MomentPost::getCreatedAt)
                .last("LIMIT 80"));
        OffsetDateTime rangeStart = isSelf ? null : momentsRangeStart(target.getMomentsVisibleRange());
        int maxCount = isSelf ? 50 : (isFriend ? 50 : 10);
        List<MomentVO> list = new ArrayList<>();
        for (MomentPost p : posts) {
            if (!isSelf && rangeStart != null && (p.getCreatedAt() == null || p.getCreatedAt().isBefore(rangeStart))) {
                continue;
            }
            if (!canViewMoment(p, viewerId, friendIds, isFriend, strangerTen)) {
                continue;
            }
            try {
                list.add(toMomentVO(p, viewerId));
            } catch (Exception e) {
                log.warn("skip broken moment id={}: {}", p.getId(), e.getMessage());
            }
            if (list.size() >= maxCount) {
                break;
            }
        }
        return list;
    }

    private boolean canViewMoment(MomentPost p, Long viewerId, java.util.Set<Long> friendIds) {
        boolean isFriend = friendIds != null && friendIds.contains(p.getUserId());
        return canViewMoment(p, viewerId, friendIds, isFriend, false);
    }

    private boolean canViewMoment(
            MomentPost p,
            Long viewerId,
            java.util.Set<Long> friendIds,
            boolean isFriendWithAuthor,
            boolean strangerTenAllowed) {
        if (p == null || viewerId == null) {
            return false;
        }
        if (Boolean.TRUE.equals(p.getRemoved())) {
            return false;
        }
        if (viewerId.equals(p.getUserId())) {
            return true;
        }
        // 拉黑双向：互不可见朋友圈
        if (isBlockedEitherWay(viewerId, p.getUserId())) {
            return false;
        }
        // 不看他的朋友圈 / 不让他看我的朋友圈
        if (isHideHisMoments(viewerId, p.getUserId())) {
            return false;
        }
        if (isRejectHisMoments(p.getUserId(), viewerId)) {
            return false;
        }
        int visibility = p.getVisibility() == null ? 0 : p.getVisibility();
        if (visibility == 1) {
            return false;
        }
        if (visibility == 2) {
            return parseIdList(p.getVisibleUserIds()).contains(viewerId);
        }
        // 0=好友可见；历史「所有人可见」(3) 已取消，按好友可见处理
        // 开启「陌生人十条」时陌生人也可看这类动态（受条数限制）
        if (isFriendWithAuthor) {
            return true;
        }
        return strangerTenAllowed;
    }

    /** 朋友圈时间范围起点；all 返回 null */
    private OffsetDateTime momentsRangeStart(String range) {
        String r = normalizeMomentsRange(range);
        OffsetDateTime now = OffsetDateTime.now();
        return switch (r) {
            case "three_days" -> now.minusDays(3);
            case "month" -> now.minusMonths(1);
            case "half_year" -> now.minusMonths(6);
            default -> null;
        };
    }

    private String normalizeMomentsRange(String range) {
        if (!StringUtils.hasText(range)) {
            return "all";
        }
        String r = range.trim().toLowerCase();
        return switch (r) {
            case "half_year", "halfyear", "6m" -> "half_year";
            case "month", "1m" -> "month";
            case "three_days", "3d", "threedays" -> "three_days";
            default -> "all";
        };
    }

    /** 不看他的朋友圈：名单 */
    public List<ContactVO> listMomentsHideUsers(Long userId) {
        return listMomentsPermissionUsers(userId, true, false);
    }

    /** 不让他看我的朋友圈：名单 */
    public List<ContactVO> listMomentsRejectUsers(Long userId) {
        return listMomentsPermissionUsers(userId, false, true);
    }

    private List<ContactVO> listMomentsPermissionUsers(Long userId, boolean hideHis, boolean rejectHis) {
        LambdaQueryWrapper<ImFriend> q = new LambdaQueryWrapper<ImFriend>().eq(ImFriend::getUserId, userId);
        if (hideHis) {
            q.eq(ImFriend::getHideHisMoments, true);
        }
        if (rejectHis) {
            q.eq(ImFriend::getRejectHisMoments, true);
        }
        q.orderByDesc(ImFriend::getCreatedAt);
        List<ImFriend> rows = friendMapper.selectList(q);
        List<ContactVO> result = new ArrayList<>();
        for (ImFriend f : rows) {
            SysUser u = userMapper.selectById(f.getFriendId());
            if (u == null) {
                continue;
            }
            String nickname = u.getNickname();
            String remark = f.getRemark();
            String displayName = displayNameService.displayName(userId, u, u.getId());
            result.add(ContactVO.builder()
                    .userId(u.getId())
                    .pulseId(u.getPulseId())
                    .nickname(nickname)
                    .displayName(displayName)
                    .avatarUrl(u.getAvatarUrl())
                    .online(isUserOnline(u.getId()))
                    .letter(letterOf(StringUtils.hasText(remark) ? remark : nickname))
                    .remark(remark)
                    .build());
        }
        return result;
    }

    /** 我设置了「不看对方朋友圈」 */
    private boolean isHideHisMoments(Long userId, Long peerId) {
        ImFriend rel = findFriend(userId, peerId);
        return rel != null && Boolean.TRUE.equals(rel.getHideHisMoments());
    }

    /** 对方设置了「不让我看他的朋友圈」（在对方的好友关系上） */
    private boolean isRejectHisMoments(Long authorId, Long viewerId) {
        ImFriend rel = findFriend(authorId, viewerId);
        return rel != null && Boolean.TRUE.equals(rel.getRejectHisMoments());
    }

    private boolean canViewMoment(MomentPost p, Long viewerId) {
        if (p == null || viewerId == null) {
            return false;
        }
        if (Boolean.TRUE.equals(p.getRemoved())) {
            return false;
        }
        java.util.Set<Long> friendIds = friendIdsOf(viewerId);
        boolean isSelf = viewerId.equals(p.getUserId());
        boolean isFriend = friendIds.contains(p.getUserId());
        boolean strangerTen = false;
        SysUser author = null;
        if (!isSelf) {
            author = userMapper.selectById(p.getUserId());
            if (!isFriend) {
                strangerTen = author != null && Boolean.TRUE.equals(author.getMomentsStrangerTen());
            }
        }
        if (!canViewMoment(p, viewerId, friendIds, isFriend, strangerTen)) {
            return false;
        }
        if (!isSelf) {
            OffsetDateTime start = author == null ? null : momentsRangeStart(author.getMomentsVisibleRange());
            if (start != null && (p.getCreatedAt() == null || p.getCreatedAt().isBefore(start))) {
                return false;
            }
        }
        return true;
    }

    /** 发现页朋友圈右侧：好友新动态头像（最多4）+ 好友数量 */
    public MomentsUpdateVO listMomentUpdates(Long viewerId) {
        java.util.Set<Long> friendIds = friendIdsOf(viewerId);
        if (friendIds.isEmpty()) {
            return MomentsUpdateVO.builder().count(0).avatars(List.of()).build();
        }
        OffsetDateTime seenAt = readMomentsSeenAt(viewerId);
        if (seenAt == null) {
            // Redis 无水位（首次 / 缓存被清空 / 部署重建）：记为当前，避免把历史好友动态全当成「有更新」
            markMomentsSeen(viewerId);
            return MomentsUpdateVO.builder().count(0).avatars(List.of()).build();
        }
        LambdaQueryWrapper<MomentPost> q = new LambdaQueryWrapper<MomentPost>()
                .in(MomentPost::getUserId, friendIds)
                .and(w -> w.isNull(MomentPost::getRemoved).or().eq(MomentPost::getRemoved, false))
                .and(w -> w.isNull(MomentPost::getVisibility)
                        .or().eq(MomentPost::getVisibility, 0)
                        .or().eq(MomentPost::getVisibility, 2)
                        .or().eq(MomentPost::getVisibility, 3))
                .gt(MomentPost::getCreatedAt, seenAt)
                .orderByDesc(MomentPost::getCreatedAt)
                .last("LIMIT 100");
        List<MomentPost> posts = momentPostMapper.selectList(q);
        java.util.LinkedHashMap<Long, SysUser> authors = new java.util.LinkedHashMap<>();
        for (MomentPost p : posts) {
            if (!canViewMoment(p, viewerId, friendIds)) continue;
            if (p.getUserId() == null || authors.containsKey(p.getUserId())) continue;
            SysUser u = userMapper.selectById(p.getUserId());
            if (u != null) authors.put(u.getId(), u);
        }
        List<MomentsUpdateVO.AvatarItem> avatars = new ArrayList<>();
        int i = 0;
        for (SysUser u : authors.values()) {
            if (i >= 4) break;
            avatars.add(MomentsUpdateVO.AvatarItem.builder()
                    .userId(u.getId())
                    .nickname(u.getNickname())
                    .avatarUrl(u.getAvatarUrl())
                    .build());
            i++;
        }
        return MomentsUpdateVO.builder()
                .count(authors.size())
                .avatars(avatars)
                .build();
    }

    public void markMomentsSeen(Long userId) {
        redis.opsForValue().set(
                RedisKeys.momentsSeen(userId),
                OffsetDateTime.now().toString(),
                java.time.Duration.ofDays(365)
        );
    }

    private OffsetDateTime readMomentsSeenAt(Long userId) {
        String raw = redis.opsForValue().get(RedisKeys.momentsSeen(userId));
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        try {
            return OffsetDateTime.parse(raw);
        } catch (Exception e) {
            return null;
        }
    }

    private java.util.Set<Long> friendIdsOf(Long userId) {
        java.util.Set<Long> ids = new java.util.HashSet<>();
        List<ImFriend> friends = friendMapper.selectList(new LambdaQueryWrapper<ImFriend>()
                .eq(ImFriend::getUserId, userId));
        for (ImFriend f : friends) {
            if (f.getFriendId() != null) ids.add(f.getFriendId());
        }
        return ids;
    }

    private List<Long> parseIdList(String raw) {
        List<Long> ids = new ArrayList<>();
        if (!StringUtils.hasText(raw)) {
            return ids;
        }
        for (String part : raw.split(",")) {
            if (!StringUtils.hasText(part)) continue;
            try {
                Long id = Long.valueOf(part.trim());
                if (!ids.contains(id)) ids.add(id);
            } catch (Exception ignored) {
                // skip
            }
        }
        return ids;
    }

    private String joinIds(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return null;
        }
        return ids.stream().map(String::valueOf).collect(java.util.stream.Collectors.joining(","));
    }

    private List<Long> filterFriendIds(java.util.Set<Long> friends, List<Long> candidates) {
        List<Long> out = new ArrayList<>();
        if (candidates == null) {
            return out;
        }
        for (Long id : candidates) {
            if (id != null && friends.contains(id) && !out.contains(id)) {
                out.add(id);
            }
        }
        return out;
    }

    public MomentVO createMoment(
            Long userId,
            String content,
            List<String> images,
            List<String> originalImages,
            List<String> mediaTypes,
            List<String> mediaFileIds,
            Integer visibility,
            List<Long> mentionUserIds,
            List<Long> visibleUserIds,
            String locationName,
            String locationAddress,
            Double latitude,
            Double longitude
    ) {
        boolean hasText = StringUtils.hasText(content);
        boolean hasMedia = images != null && !images.isEmpty();
        if (!hasText && !hasMedia) {
            throw new BizException("请输入内容或添加图片/视频");
        }
        if (hasText) {
            sensitiveWordService.assertCleanText(content);
        }
        if (images != null && images.size() > 9) {
            throw new BizException("最多上传 9 个图片或视频");
        }
        List<String> validatedMediaFileIds = validateMomentMediaFileIds(userId, images, mediaFileIds);
        int vis = visibility == null ? 0 : visibility;
        // 已取消「所有人可见」(3)，按好友可见处理
        if (vis == 3) {
            vis = 0;
        }
        if (vis != 0 && vis != 1 && vis != 2) {
            vis = 0;
        }
        java.util.Set<Long> friends = friendIdsOf(userId);
        List<Long> visibles = new ArrayList<>();
        if (vis == 2) {
            visibles = filterFriendIds(friends, visibleUserIds);
            if (visibles.isEmpty()) {
                throw new BizException("请选择可见好友");
            }
        }
        List<Long> mentions = filterFriendIds(friends, mentionUserIds);
        if (vis == 1) {
            mentions = List.of();
        } else if (vis == 2) {
            java.util.Set<Long> visibleSet = new java.util.HashSet<>(visibles);
            mentions = mentions.stream().filter(visibleSet::contains).toList();
        }
        MomentPost post = new MomentPost();
        post.setUserId(userId);
        post.setContent(content == null ? "" : content.trim());
        post.setImages(hasMedia ? String.join(",", images) : null);
        post.setOriginalImages(hasMedia && originalImages != null && originalImages.size() == images.size()
                ? String.join(",", originalImages) : post.getImages());
        post.setMediaTypes(hasMedia && mediaTypes != null && mediaTypes.size() == images.size()
                ? String.join(",", mediaTypes) : null);
        post.setMediaFileIds(hasMedia && validatedMediaFileIds.size() == images.size()
                ? String.join(",", validatedMediaFileIds) : null);
        post.setVisibility(vis);
        post.setVisibleUserIds(vis == 2 ? joinIds(visibles) : null);
        post.setMentionUserIds(joinIds(mentions));
        post.setLocationName(StringUtils.hasText(locationName) ? locationName.trim() : null);
        post.setLocationAddress(StringUtils.hasText(locationAddress) ? locationAddress.trim() : null);
        post.setLatitude(latitude);
        post.setLongitude(longitude);
        post.setLikeCount(0);
        post.setCommentCount(0);
        post.setCreatedAt(OffsetDateTime.now());
        momentPostMapper.insert(post);
        for (Long mentionId : mentions) {
            if (mentionId != null && !mentionId.equals(userId)) {
                recordInteraction(mentionId, userId, post.getId(), null, "mention", "提到了你");
            }
        }
        return toMomentVO(post, userId);
    }

    private MomentVO toMomentVO(MomentPost p, Long viewerId) {
        SysUser u = userMapper.selectById(p.getUserId());
        List<String> images = new ArrayList<>();
        if (StringUtils.hasText(p.getImages())) {
            images = Arrays.stream(p.getImages().split(",")).filter(StringUtils::hasText).toList();
        }
        List<String> originalImages = StringUtils.hasText(p.getOriginalImages())
                ? Arrays.stream(p.getOriginalImages().split(",")).filter(StringUtils::hasText).toList()
                : images;
        List<String> mediaTypes = StringUtils.hasText(p.getMediaTypes())
                ? Arrays.stream(p.getMediaTypes().split(",")).toList()
                : images.stream().map(url -> {
                    String lower = url.toLowerCase(Locale.ROOT);
                    return lower.matches(".*\\.(mp4|mov|m4v|webm)(\\?.*)?$") ? "video" : "image";
                }).toList();
        List<String> mediaFileIds = StringUtils.hasText(p.getMediaFileIds())
                ? Arrays.stream(p.getMediaFileIds().split(",")).map(String::trim).toList()
                : List.of();
        List<Long> mentionIds = parseIdList(p.getMentionUserIds());
        List<String> mentionNames = new ArrayList<>();
        for (Long id : mentionIds) {
            SysUser mu = userMapper.selectById(id);
            mentionNames.add(displayNameOf(viewerId, mu, id));
        }
        List<Long> visibleIds = parseIdList(p.getVisibleUserIds());
        List<String> visibleNames = new ArrayList<>();
        for (Long id : visibleIds) {
            SysUser vu = userMapper.selectById(id);
            visibleNames.add(displayNameOf(viewerId, vu, id));
        }
        boolean mentionedMe = viewerId != null && mentionIds.contains(viewerId);
        boolean likedByMe = false;
        boolean favoritedByMe = false;
        List<String> likeNames = new ArrayList<>();
        List<Long> likeUserIds = new ArrayList<>();
        if (p.getId() != null) {
            try {
                List<MomentLike> likes = momentLikeMapper.selectList(new LambdaQueryWrapper<MomentLike>()
                        .eq(MomentLike::getPostId, p.getId())
                        .orderByAsc(MomentLike::getId)
                        .last("LIMIT 20"));
                for (MomentLike like : likes) {
                    if (viewerId != null && viewerId.equals(like.getUserId())) {
                        likedByMe = true;
                    }
                    SysUser lu = userMapper.selectById(like.getUserId());
                    likeUserIds.add(like.getUserId());
                    likeNames.add(displayNameOf(viewerId, lu, like.getUserId()));
                }
                if (!likedByMe && viewerId != null) {
                    Long cnt = momentLikeMapper.selectCount(new LambdaQueryWrapper<MomentLike>()
                            .eq(MomentLike::getPostId, p.getId())
                            .eq(MomentLike::getUserId, viewerId));
                    likedByMe = cnt != null && cnt > 0;
                }
            } catch (Exception e) {
                log.warn("load moment likes failed postId={}: {}", p.getId(), e.getMessage());
            }
        }
        if (p.getId() != null && viewerId != null) {
            Long favoriteCount = favoriteMapper.selectCount(new LambdaQueryWrapper<ImFavorite>()
                    .eq(ImFavorite::getUserId, viewerId)
                    .eq(ImFavorite::getMsgId, momentFavoriteMsgId(p.getId())));
            favoritedByMe = favoriteCount != null && favoriteCount > 0;
        }
        List<MomentCommentVO> comments;
        try {
            comments = listCommentVOs(p.getId(), viewerId);
        } catch (Exception e) {
            log.warn("load moment comments failed postId={}: {}", p.getId(), e.getMessage());
            comments = List.of();
        }
        return MomentVO.builder()
                .id(p.getId())
                .userId(p.getUserId())
                .mine(viewerId != null && viewerId.equals(p.getUserId()))
                .nickname(displayNameOf(viewerId, u, p.getUserId()))
                .avatarUrl(u != null ? u.getAvatarUrl() : null)
                .content(p.getContent())
                .images(images == null ? List.of() : images)
                .originalImages(originalImages == null ? List.of() : originalImages)
                .mediaTypes(mediaTypes == null ? List.of() : mediaTypes)
                .mediaFileIds(mediaFileIds)
                .visibility(p.getVisibility() == null ? 0 : p.getVisibility())
                .mentionUserIds(mentionIds)
                .mentionNicknames(mentionNames)
                .visibleUserIds(visibleIds)
                .visibleNicknames(visibleNames)
                .locationName(p.getLocationName())
                .locationAddress(p.getLocationAddress())
                .latitude(p.getLatitude())
                .longitude(p.getLongitude())
                .mentionedMe(mentionedMe)
                .likeCount(p.getLikeCount() == null ? 0 : p.getLikeCount())
                .commentCount(p.getCommentCount() == null ? 0 : p.getCommentCount())
                .likedByMe(likedByMe)
                .favoritedByMe(favoritedByMe)
                .likeNicknames(likeNames)
                .likeUserIds(likeUserIds)
                .comments(comments)
                .createdAt(p.getCreatedAt())
                .build();
    }

    private List<String> validateMomentMediaFileIds(Long userId, List<String> images, List<String> mediaFileIds) {
        if (images == null || images.isEmpty() || mediaFileIds == null || mediaFileIds.isEmpty()) return List.of();
        if (mediaFileIds.size() != images.size()) {
            throw new BizException("动态媒体引用数量不匹配");
        }
        List<String> result = new ArrayList<>();
        for (String rawId : mediaFileIds) {
            String fileId = rawId == null ? "" : rawId.trim();
            ImFile file = StringUtils.hasText(fileId) ? fileMapper.selectById(fileId) : null;
            if (file == null || !userId.equals(file.getUploaderId()) || !"READY".equalsIgnoreCase(file.getStatus())) {
                throw new BizException("动态媒体文件无效");
            }
            result.add(fileId);
        }
        return result;
    }

    private static String momentFavoriteMsgId(Long postId) {
        return "moment:" + postId;
    }

    private List<MomentCommentVO> listCommentVOs(Long postId, Long viewerId) {
        if (postId == null) return List.of();
        List<MomentComment> list = momentCommentMapper.selectList(new LambdaQueryWrapper<MomentComment>()
                .eq(MomentComment::getPostId, postId)
                .orderByAsc(MomentComment::getId)
                .last("LIMIT 50"));
        java.util.Map<Long, MomentComment> byId = new java.util.HashMap<>();
        for (MomentComment c : list) {
            if (c.getId() != null) {
                byId.put(c.getId(), c);
            }
        }
        List<MomentCommentVO> out = new ArrayList<>();
        for (MomentComment c : list) {
            out.add(toCommentVO(c, byId, viewerId));
        }
        return out;
    }

    private MomentCommentVO toCommentVO(
            MomentComment c,
            java.util.Map<Long, MomentComment> byId,
            Long viewerId
    ) {
        SysUser cu = userMapper.selectById(c.getUserId());
        Long replyToId = c.getReplyToCommentId();
        Long replyToUserId = null;
        String replyToNickname = null;
        if (replyToId != null) {
            MomentComment parent = byId != null ? byId.get(replyToId) : null;
            if (parent == null) {
                parent = momentCommentMapper.selectById(replyToId);
            }
            if (parent != null) {
                replyToUserId = parent.getUserId();
                SysUser pu = userMapper.selectById(parent.getUserId());
                replyToNickname = displayNameOf(viewerId, pu, parent.getUserId());
            }
        }
        return MomentCommentVO.builder()
                .id(c.getId())
                .userId(c.getUserId())
                .nickname(displayNameOf(viewerId, cu, c.getUserId()))
                .avatarUrl(cu != null ? cu.getAvatarUrl() : null)
                .content(c.getContent())
                .replyToCommentId(replyToId)
                .replyToUserId(replyToUserId)
                .replyToNickname(replyToNickname)
                .imageUrl(c.getImageUrl())
                .imageFileId(c.getImageFileId())
                .createdAt(c.getCreatedAt())
                .build();
    }

    public MomentVO toggleMomentLike(Long userId, Long postId) {
        MomentPost post = requireVisibleMoment(userId, postId);
        MomentLike exist = momentLikeMapper.selectOne(new LambdaQueryWrapper<MomentLike>()
                .eq(MomentLike::getPostId, postId)
                .eq(MomentLike::getUserId, userId)
                .last("LIMIT 1"));
        if (exist != null) {
            momentLikeMapper.deleteById(exist.getId());
            int next = Math.max(0, (post.getLikeCount() == null ? 0 : post.getLikeCount()) - 1);
            post.setLikeCount(next);
            momentPostMapper.updateById(post);
            removeLikeInteraction(post.getUserId(), userId, postId);
        } else {
            MomentLike like = new MomentLike();
            like.setPostId(postId);
            like.setUserId(userId);
            like.setCreatedAt(OffsetDateTime.now());
            momentLikeMapper.insert(like);
            post.setLikeCount((post.getLikeCount() == null ? 0 : post.getLikeCount()) + 1);
            momentPostMapper.updateById(post);
            if (post.getUserId() != null && !post.getUserId().equals(userId)) {
                recordInteraction(post.getUserId(), userId, postId, null, "like", "赞了你的朋友圈");
            }
        }
        return toMomentVO(momentPostMapper.selectById(postId), userId);
    }

    public MomentVO toggleMomentFavorite(Long userId, Long postId) {
        MomentPost post = requireVisibleMoment(userId, postId);
        String momentMsgId = momentFavoriteMsgId(postId);
        ImFavorite existing = favoriteMapper.selectOne(new LambdaQueryWrapper<ImFavorite>()
                .eq(ImFavorite::getUserId, userId)
                .eq(ImFavorite::getMsgId, momentMsgId)
                .last("LIMIT 1"));
        if (existing != null) {
            favoriteMapper.deleteById(existing.getId());
        } else {
            SysUser author = userMapper.selectById(post.getUserId());
            ImFavorite favorite = new ImFavorite();
            favorite.setUserId(userId);
            favorite.setConversationId(0L);
            favorite.setMsgId(momentMsgId);
            favorite.setMsgType(10);
            favorite.setContent(post.getContent() == null ? "" : post.getContent());
            favorite.setImages(post.getImages());
            favorite.setMediaTypes(post.getMediaTypes());
            favorite.setMediaFileIds(post.getMediaFileIds());
            favorite.setFromNickname(displayNameOf(userId, author, post.getUserId()));
            favorite.setSourceTitle("朋友圈");
            favorite.setCreatedAt(OffsetDateTime.now());
            favoriteMapper.insert(favorite);
        }
        return toMomentVO(momentPostMapper.selectById(postId), userId);
    }

    public MomentCommentVO addMomentComment(
            Long userId,
            Long postId,
            String content,
            Long replyToCommentId,
            String imageFileId,
            String imageUrl) {
        String text = content == null ? "" : content.trim();
        String fileId = validateMomentCommentImageFileId(userId, imageFileId);
        String img = fileId == null && StringUtils.hasText(imageUrl) ? imageUrl.trim() : null;
        if (!StringUtils.hasText(text) && img == null) {
            throw new BizException("请输入评论或添加图片");
        }
        if (text.length() > 500) {
            throw new BizException("评论不能超过 500 字");
        }
        if (img != null && img.length() > 512) {
            throw new BizException("图片地址过长");
        }
        MomentPost post = requireVisibleMoment(userId, postId);
        Long replyId = null;
        Long replyTargetUserId = null;
        if (replyToCommentId != null) {
            MomentComment parent = momentCommentMapper.selectById(replyToCommentId);
            if (parent == null || !postId.equals(parent.getPostId())) {
                throw new BizException("回复的评论不存在");
            }
            replyId = parent.getId();
            replyTargetUserId = parent.getUserId();
        }
        MomentComment c = new MomentComment();
        c.setPostId(postId);
        c.setUserId(userId);
        c.setContent(text);
        c.setReplyToCommentId(replyId);
        c.setImageUrl(img);
        c.setImageFileId(fileId);
        c.setCreatedAt(OffsetDateTime.now());
        momentCommentMapper.insert(c);
        post.setCommentCount((post.getCommentCount() == null ? 0 : post.getCommentCount()) + 1);
        momentPostMapper.updateById(post);

        String snippet = StringUtils.hasText(text) ? truncateText(text, 40) : "[图片]";
        boolean isReply = replyTargetUserId != null;
        if (isReply && !replyTargetUserId.equals(userId)) {
            recordInteraction(
                    replyTargetUserId, userId, postId, c.getId(), "reply",
                    "回复了你：" + snippet
            );
        }
        if (post.getUserId() != null
                && !post.getUserId().equals(userId)
                && !(isReply && post.getUserId().equals(replyTargetUserId))) {
            recordInteraction(
                    post.getUserId(), userId, postId, c.getId(),
                    isReply ? "comment" : "comment",
                    isReply ? ("评论了你的朋友圈：" + snippet) : ("评论了你：" + snippet)
            );
        }
        return toCommentVO(c, null, userId);
    }

    /**
     * 评论图片也必须先上传到对象存储，再只引用 im_file.file_id。
     * 旧 imageUrl 评论继续走兼容分支，但新请求不能伪造别人的文件引用。
     */
    private String validateMomentCommentImageFileId(Long userId, String rawFileId) {
        if (!StringUtils.hasText(rawFileId)) return null;
        String fileId = rawFileId.trim();
        ImFile file = fileMapper.selectById(fileId);
        if (file == null
                || !userId.equals(file.getUploaderId())
                || !"READY".equalsIgnoreCase(file.getStatus())) {
            throw new BizException("评论图片无效");
        }
        String contentType = file.getContentType();
        if (StringUtils.hasText(contentType) && !contentType.toLowerCase(Locale.ROOT).startsWith("image/")) {
            throw new BizException("评论只能添加图片");
        }
        return fileId;
    }

    public void deleteMomentComment(Long userId, Long commentId) {
        MomentComment c = momentCommentMapper.selectById(commentId);
        if (c == null) {
            throw new BizException("评论不存在");
        }
        MomentPost post = momentPostMapper.selectById(c.getPostId());
        boolean owner = post != null && userId.equals(post.getUserId());
        if (!userId.equals(c.getUserId()) && !owner) {
            throw new BizException("无权删除该评论");
        }
        momentCommentMapper.deleteById(commentId);
        momentInteractionMapper.delete(new LambdaQueryWrapper<MomentInteraction>()
                .eq(MomentInteraction::getCommentId, commentId));
        if (post != null) {
            post.setCommentCount(Math.max(0, (post.getCommentCount() == null ? 0 : post.getCommentCount()) - 1));
            momentPostMapper.updateById(post);
        }
    }

    public void deleteMoment(Long userId, Long postId) {
        MomentPost post = momentPostMapper.selectById(postId);
        if (post == null || Boolean.TRUE.equals(post.getRemoved())) {
            throw new BizException("动态不存在");
        }
        if (!userId.equals(post.getUserId())) {
            throw new BizException("只能删除自己的动态");
        }
        post.setRemoved(true);
        post.setRemovedAt(OffsetDateTime.now());
        post.setRemovedBy("user");
        momentPostMapper.updateById(post);
        momentInteractionMapper.delete(new LambdaQueryWrapper<MomentInteraction>()
                .eq(MomentInteraction::getPostId, postId));
    }

    public MomentVO getMoment(Long viewerId, Long postId) {
        return toMomentVO(requireVisibleMoment(viewerId, postId), viewerId);
    }

    public List<MomentInteractionVO> listMomentInteractions(Long userId, Integer limit) {
        int lim = limit == null || limit <= 0 ? 50 : Math.min(limit, 100);
        List<MomentInteraction> rows = momentInteractionMapper.selectList(new LambdaQueryWrapper<MomentInteraction>()
                .eq(MomentInteraction::getRecipientUserId, userId)
                .orderByDesc(MomentInteraction::getCreatedAt)
                .last("LIMIT " + lim));
        List<MomentInteractionVO> out = new ArrayList<>();
        for (MomentInteraction row : rows) {
            out.add(toInteractionVO(row, userId));
        }
        return out;
    }

    public long countUnreadMomentInteractions(Long userId) {
        Long cnt = momentInteractionMapper.selectCount(new LambdaQueryWrapper<MomentInteraction>()
                .eq(MomentInteraction::getRecipientUserId, userId)
                .eq(MomentInteraction::getIsRead, false));
        return cnt == null ? 0L : cnt;
    }

    public void markMomentInteractionsRead(Long userId, Long interactionId) {
        if (interactionId != null) {
            MomentInteraction row = momentInteractionMapper.selectById(interactionId);
            if (row == null || !userId.equals(row.getRecipientUserId())) {
                throw new BizException("通知不存在");
            }
            if (!Boolean.TRUE.equals(row.getIsRead())) {
                row.setIsRead(true);
                momentInteractionMapper.updateById(row);
            }
            return;
        }
        List<MomentInteraction> unread = momentInteractionMapper.selectList(new LambdaQueryWrapper<MomentInteraction>()
                .eq(MomentInteraction::getRecipientUserId, userId)
                .eq(MomentInteraction::getIsRead, false)
                .last("LIMIT 500"));
        for (MomentInteraction row : unread) {
            row.setIsRead(true);
            momentInteractionMapper.updateById(row);
        }
    }

    public MomentVO updateMomentVisibility(Long userId, Long postId, Integer visibility, List<Long> visibleUserIds) {
        MomentPost post = momentPostMapper.selectById(postId);
        if (post == null || Boolean.TRUE.equals(post.getRemoved())) {
            throw new BizException("动态不存在");
        }
        if (!userId.equals(post.getUserId())) {
            throw new BizException("只能修改自己的动态");
        }
        int vis = visibility == null ? 0 : visibility;
        // 已取消「所有人可见」(3)，按好友可见处理
        if (vis == 3) {
            vis = 0;
        }
        if (vis != 0 && vis != 1 && vis != 2) {
            vis = 0;
        }
        java.util.Set<Long> friends = friendIdsOf(userId);
        List<Long> visibles = new ArrayList<>();
        if (vis == 2) {
            visibles = filterFriendIds(friends, visibleUserIds);
            if (visibles.isEmpty()) {
                throw new BizException("请选择可见好友");
            }
        }
        post.setVisibility(vis);
        post.setVisibleUserIds(vis == 2 ? joinIds(visibles) : null);
        momentPostMapper.updateById(post);
        return toMomentVO(post, userId);
    }

    private MomentPost requireVisibleMoment(Long viewerId, Long postId) {
        MomentPost post = momentPostMapper.selectById(postId);
        if (post == null || Boolean.TRUE.equals(post.getRemoved())) {
            throw new BizException("动态不存在");
        }
        if (!canViewMoment(post, viewerId)) {
            throw new BizException("无权查看该动态");
        }
        return post;
    }

    private void recordInteraction(
            Long recipientUserId,
            Long actorUserId,
            Long postId,
            Long commentId,
            String type,
            String summary
    ) {
        if (recipientUserId == null || actorUserId == null || postId == null || !StringUtils.hasText(type)) {
            return;
        }
        if (recipientUserId.equals(actorUserId)) {
            return;
        }
        MomentInteraction row = new MomentInteraction();
        row.setRecipientUserId(recipientUserId);
        row.setActorUserId(actorUserId);
        row.setPostId(postId);
        row.setCommentId(commentId);
        row.setType(type);
        row.setSummary(truncateText(summary == null ? "" : summary, 180));
        row.setIsRead(false);
        row.setCreatedAt(OffsetDateTime.now());
        momentInteractionMapper.insert(row);
    }

    private void removeLikeInteraction(Long recipientUserId, Long actorUserId, Long postId) {
        if (recipientUserId == null || actorUserId == null || postId == null) {
            return;
        }
        momentInteractionMapper.delete(new LambdaQueryWrapper<MomentInteraction>()
                .eq(MomentInteraction::getRecipientUserId, recipientUserId)
                .eq(MomentInteraction::getActorUserId, actorUserId)
                .eq(MomentInteraction::getPostId, postId)
                .eq(MomentInteraction::getType, "like"));
    }

    private MomentInteractionVO toInteractionVO(MomentInteraction row, Long viewerId) {
        SysUser actor = userMapper.selectById(row.getActorUserId());
        MomentPost post = momentPostMapper.selectById(row.getPostId());
        String postPreview = "";
        if (post != null) {
            if (StringUtils.hasText(post.getContent())) {
                postPreview = truncateText(post.getContent(), 36);
            } else if (StringUtils.hasText(post.getImages())) {
                postPreview = "[图片]";
            }
        }
        return MomentInteractionVO.builder()
                .id(row.getId())
                .type(row.getType())
                .actorUserId(row.getActorUserId())
                .actorNickname(displayNameOf(viewerId, actor, row.getActorUserId()))
                .actorAvatarUrl(actor != null ? actor.getAvatarUrl() : null)
                .postId(row.getPostId())
                .commentId(row.getCommentId())
                .summary(row.getSummary())
                .postPreview(postPreview)
                .isRead(Boolean.TRUE.equals(row.getIsRead()))
                .createdAt(row.getCreatedAt())
                .build();
    }

    private String truncateText(String text, int max) {
        if (!StringUtils.hasText(text)) {
            return "";
        }
        String t = text.trim();
        if (t.length() <= max) {
            return t;
        }
        return t.substring(0, Math.max(0, max - 1)) + "…";
    }
}
