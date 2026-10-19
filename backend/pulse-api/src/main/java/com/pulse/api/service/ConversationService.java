package com.pulse.api.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.pulse.api.entity.ImConversation;
import com.pulse.api.entity.ImConversationMember;
import com.pulse.api.entity.ImFriend;
import com.pulse.api.entity.ImGroupJoinRequest;
import com.pulse.api.entity.ImMessage;
import com.pulse.api.entity.ImUserBlock;
import com.pulse.api.entity.SysUser;
import com.pulse.api.event.GroupMemberJoinedEvent;
import com.pulse.api.mapper.ImConversationMapper;
import com.pulse.api.mapper.ImConversationMemberMapper;
import com.pulse.api.mapper.ImFriendMapper;
import com.pulse.api.mapper.ImGroupJoinRequestMapper;
import com.pulse.api.mapper.ImMessageHideMapper;
import com.pulse.api.mapper.ImMessageMapper;
import com.pulse.api.mapper.ImUserBlockMapper;
import com.pulse.api.mapper.SysUserMapper;
import com.pulse.api.vo.ConversationReadStateVO;
import com.pulse.api.vo.ConversationVO;
import com.pulse.api.vo.GroupDetailVO;
import com.pulse.api.vo.GroupJoinRequestVO;
import com.pulse.api.vo.GroupJoinResultVO;
import com.pulse.api.vo.GroupPreviewVO;
import com.pulse.api.vo.ImportantNotificationSettingVO;
import com.pulse.common.constant.RedisKeys;
import com.pulse.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.OffsetDateTime;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class ConversationService {
    private static final SecureRandom GROUP_PULSE_RANDOM = new SecureRandom();

    private final ImConversationMapper conversationMapper;
    private final ImConversationMemberMapper memberMapper;
    private final ImFriendMapper friendMapper;
    private final SysUserMapper userMapper;
    private final ImMessageMapper messageMapper;
    private final ImMessageHideMapper messageHideMapper;
    private final ImUserBlockMapper userBlockMapper;
    private final ImGroupJoinRequestMapper groupJoinRequestMapper;
    private final GroupMemberEventService groupMemberEventService;
    private final GroupOwnerTransferService groupOwnerTransferService;
    private final BurnAfterReadService burnAfterReadService;
    private final FileTransferAssistantService fileTransferAssistantService;
    private final DefaultFriendService defaultFriendService;
    private final DisplayNameService displayNameService;
    private final StringRedisTemplate redis;
    private final ApplicationEventPublisher eventPublisher;

    public List<ConversationVO> listMine(Long userId, String filter) {
        // Keep conversations consistent with contacts: newly created accounts
        // must receive configured default friends before resolving friend tags.
        defaultFriendService.ensureForUser(userId);
        fileTransferAssistantService.ensureForUser(userId);
        // 若首页无会话但有好友，自动补齐私聊会话，保证对话出现在首页
        ensurePrivateConversationsForFriends(userId);

        List<ConversationVO> list = conversationMapper.listByUserId(userId);
        list = dedupePrivateConversations(userId, list);
        boolean groupContacts = "group".equalsIgnoreCase(filter) || "群组".equals(filter);
        if (!groupContacts) {
            // 消息首页、未读和归档仍隐藏“删除会话”；联系人-群聊不受该入口影响。
            list = list.stream()
                    .filter(vo -> !Boolean.TRUE.equals(vo.getHidden()))
                    .toList();
        }
        // 我拉黑的用户：消息列表不展示（对方侧仍可见）
        Set<Long> blockedByMe = loadBlockedPeerIds(userId);
        // 拉黑我的用户：会话仍可见，但不暴露其真实在线状态
        Set<Long> blockedMe = loadBlockerIds(userId);
        if (!blockedByMe.isEmpty()) {
            list = list.stream()
                    .filter(vo -> {
                        if (vo.getType() != null && vo.getType() == 1 && vo.getPeerUserId() != null) {
                            return !blockedByMe.contains(vo.getPeerUserId());
                        }
                        return true;
                    })
                    .toList();
        }
        for (ConversationVO vo : list) {
            // 兼容早期版本把系统消息 JSON 直接写进会话预览的历史数据。
            // 普通文本消息保持原样，只有能识别为结构化消息的内容才转换成摘要。
            vo.setLastMsgPreview(normalizeConversationPreview(vo.getLastMsgPreview()));
            if (vo.getArchived() == null) {
                vo.setArchived(false);
            }
            if (vo.getPinned() == null) {
                vo.setPinned(false);
            }
            if (vo.getMute() == null) {
                vo.setMute(false);
            }
            if (vo.getPeerUserId() != null) {
                SysUser peer = userMapper.selectById(vo.getPeerUserId());
                if (peer != null) {
                    vo.setTitle(displayNameService.displayName(userId, peer, peer.getId()));
                    vo.setPeerNickname(peer.getNickname());
                    // Always return the current peer avatar. Legacy
                    // conversation rows can retain an old avatar after a
                    // profile change.
                    vo.setAvatarUrl(peer.getAvatarUrl());
                }
                ImFriend relation = findFriendRel(userId, vo.getPeerUserId());
                if (relation != null && StringUtils.hasText(relation.getTag())) {
                    vo.setTag(relation.getTag().trim());
                }
                vo.setFileTransferAssistant(fileTransferAssistantService.isAssistant(vo.getPeerUserId()));
                boolean hidden = isPeerOnlineHidden(userId, vo.getPeerUserId());
                vo.setOnlineHidden(hidden);
                vo.setOnline(!hidden && isPeerOnlineVisible(userId, vo.getPeerUserId(), blockedMe));
            } else {
                vo.setOnline(false);
                vo.setOnlineHidden(false);
            }
        }
        boolean archiveOnly = "archive".equalsIgnoreCase(filter) || "归档".equals(filter);
        list = list.stream()
                .filter(vo -> archiveOnly == Boolean.TRUE.equals(vo.getArchived()))
                .toList();
        if (!StringUtils.hasText(filter) || "all".equalsIgnoreCase(filter) || "全部".equals(filter) || archiveOnly) {
            return list;
        }
        return list.stream().filter(vo -> matchFilter(vo, filter)).toList();
    }

    private String normalizeConversationPreview(String preview) {
        if (!StringUtils.hasText(preview)) {
            return preview;
        }
        int jsonStart = preview.indexOf('{');
        if (jsonStart < 0) {
            return preview;
        }
        String prefix = preview.substring(0, jsonStart);
        String json = preview.substring(jsonStart);
        try {
            com.fasterxml.jackson.databind.JsonNode node =
                    new com.fasterxml.jackson.databind.ObjectMapper().readTree(json);
            if (node == null || !node.isObject()) {
                return preview;
            }
            String kind = node.path("kind").asText(node.path("type").asText(node.path("event").asText("")));
            String lowerKind = kind.toLowerCase(java.util.Locale.ROOT);
            String text = node.path("text").asText(node.path("message").asText(""));
            if (lowerKind.contains("video_call") || "video".equalsIgnoreCase(node.path("mediaType").asText())) {
                return prefix + "[视频通话]" + (StringUtils.hasText(text) ? " " + text : "");
            }
            if (lowerKind.contains("voice_call") || lowerKind.contains("audio_call")
                    || node.has("callId") || node.has("call_id")) {
                return prefix + "[语音通话]" + (StringUtils.hasText(text) ? " " + text : "");
            }
            if (lowerKind.contains("red_packet") || node.has("packetType") || node.has("packetNo")) {
                return prefix + "[红包]";
            }
            if (lowerKind.contains("transfer") || node.has("transferNo")) {
                return prefix + "[转账]";
            }
            if (node.has("url") || node.has("originalUrl")) {
                String contentType = node.path("contentType").asText(node.path("mimeType").asText(""));
                if (contentType.toLowerCase(java.util.Locale.ROOT).startsWith("image/")) {
                    return prefix + "[图片]";
                }
                if (contentType.toLowerCase(java.util.Locale.ROOT).startsWith("video/")) {
                    return prefix + "[视频]";
                }
                return prefix + "[文件]";
            }
            if (node.has("cardType") || node.has("communityId")) {
                return prefix + "[名片]";
            }
            if (node.has("latitude") || node.has("lat") || node.has("longitude") || node.has("lng")) {
                return prefix + "[位置]";
            }
            if (node.has("items") || node.has("sourceTitle")) {
                return prefix + "[聊天记录]";
            }
            if (StringUtils.hasText(kind)) {
                return StringUtils.hasText(text) ? prefix + text : prefix + "[系统消息]";
            }
        } catch (Exception ignored) {
            // 不是结构化消息时按普通文本预览，不改变用户发送的 JSON 文本。
        }
        return preview;
    }

    /** 我拉黑的用户 ID 集合 */
    private Set<Long> loadBlockedPeerIds(Long userId) {
        List<ImUserBlock> rows = userBlockMapper.selectList(new LambdaQueryWrapper<ImUserBlock>()
                .eq(ImUserBlock::getUserId, userId));
        Set<Long> ids = new java.util.HashSet<>();
        for (ImUserBlock b : rows) {
            if (b.getBlockedUserId() != null) {
                ids.add(b.getBlockedUserId());
            }
        }
        return ids;
    }

    /** 拉黑了我的用户 ID 集合 */
    private Set<Long> loadBlockerIds(Long userId) {
        List<ImUserBlock> rows = userBlockMapper.selectList(new LambdaQueryWrapper<ImUserBlock>()
                .eq(ImUserBlock::getBlockedUserId, userId));
        Set<Long> ids = new java.util.HashSet<>();
        for (ImUserBlock b : rows) {
            if (b.getUserId() != null) {
                ids.add(b.getUserId());
            }
        }
        return ids;
    }

    /** 被对方拉黑时不暴露对方真实在线 */
    private boolean isPeerOnlineVisible(Long viewerId, Long peerUserId, Set<Long> blockedMe) {
        if (peerUserId == null) {
            return false;
        }
        if (blockedMe != null && blockedMe.contains(peerUserId)) {
            return false;
        }
        if (blockedMe == null && isBlockedByMe(peerUserId, viewerId)) {
            return false;
        }
        return StringUtils.hasText(redis.opsForValue().get(RedisKeys.online(peerUserId)));
    }

    /** 在线状态是否被隐藏（任意一方开启隐藏即隐藏） */
    private boolean isPeerOnlineHidden(Long viewerId, Long peerUserId) {
        if (viewerId == null || peerUserId == null || viewerId.equals(peerUserId)) {
            return false;
        }
        SysUser viewer = userMapper.selectById(viewerId);
        SysUser peer = userMapper.selectById(peerUserId);
        return (viewer != null && Boolean.TRUE.equals(viewer.getHideOnlineStatus()))
                || (peer != null && Boolean.TRUE.equals(peer.getHideOnlineStatus()));
    }

    private ConversationVO withPeerOnline(ConversationVO vo, Long viewerId, Long peerUserId) {
        if (vo != null) {
            boolean hidden = isPeerOnlineHidden(viewerId, peerUserId);
            vo.setOnlineHidden(hidden);
            vo.setOnline(!hidden && isPeerOnlineVisible(viewerId, peerUserId, null));
        }
        return vo;
    }

    /**
     * 进入会话后清零未读，并推进已读水位；向其他成员推送 READ_RECEIPT。
     *
     * @param lastReadMsgId 可选；为空则推进到会话最新一条消息
     */
    @Transactional
    public Map<String, Object> markRead(Long userId, Long conversationId, String lastReadMsgId) {
        ImConversationMember member = requireMember(userId, conversationId);
        member.setUnreadCount(0);
        member.setHidden(false);
        member.setMentionUnread(false);

        ImMessage target = resolveReadTarget(conversationId, lastReadMsgId);
        boolean advanced = false;
        if (target != null && StringUtils.hasText(target.getMsgId())) {
            if (shouldAdvanceRead(conversationId, member.getLastReadMsgId(), target)) {
                member.setLastReadMsgId(target.getMsgId());
                member.setLastReadAt(OffsetDateTime.now());
                advanced = true;
            }
        }
        memberMapper.updateById(member);

        String effectiveMsgId = member.getLastReadMsgId();
        Long sendTimeMs = lookupMsgSendTimeMs(conversationId, effectiveMsgId);
        if (advanced && StringUtils.hasText(effectiveMsgId)) {
            burnAfterReadService.startCountdowns(userId, conversationId, effectiveMsgId);
            // 已读回执开关：关闭后不向对方推送已读状态
            if (readReceiptEnabled(userId)) {
                publishReadReceipt(conversationId, userId, effectiveMsgId, sendTimeMs);
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("conversationId", conversationId);
        out.put("lastReadMsgId", effectiveMsgId == null ? "" : effectiveMsgId);
        out.put("lastReadSendTime", sendTimeMs == null ? 0L : sendTimeMs);
        out.put("lastReadAt", member.getLastReadAt());
        return out;
    }

    /** 兼容旧调用：仅清未读并尽量推进到最新消息 */
    @Transactional
    public void markRead(Long userId, Long conversationId) {
        markRead(userId, conversationId, null);
    }

    public ConversationReadStateVO getReadStates(Long userId, Long conversationId) {
        requireMember(userId, conversationId);
        ImConversation c = conversationMapper.selectById(conversationId);
        if (c == null) {
            throw new BizException("会话不存在");
        }
        // 已读回执开关：请求方关闭后不返回任何已读状态
        List<ImConversationMember> members = memberMapper.selectList(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId));
        Map<Long, Boolean> receiptFlags = readReceiptFlags(
                members.stream()
                        .map(ImConversationMember::getUserId)
                        .filter(java.util.Objects::nonNull)
                        .toList());
        boolean receiptsEnabled = readReceiptEnabled(userId)
                && receiptFlags.values().stream().allMatch(Boolean.TRUE::equals);
        if (!receiptsEnabled) {
            return ConversationReadStateVO.builder()
                    .conversationId(conversationId)
                    .conversationType(c.getType())
                    .readReceiptEnabled(false)
                    .members(List.of())
                    .build();
        }
        Map<String, Long> sendTimeCache = new HashMap<>();
        List<ConversationReadStateVO.MemberReadState> states = new ArrayList<>();
        String myLast = null;
        Long mySend = null;
        String peerLast = null;
        Long peerSend = null;
        for (ImConversationMember m : members) {
            if (m.getUserId() == null) continue;
            // 该成员关闭已读回执时，不展示其已读状态
            if (!Boolean.TRUE.equals(receiptFlags.getOrDefault(m.getUserId(), Boolean.TRUE))) {
                continue;
            }
            Long st = lookupMsgSendTimeMsCached(conversationId, m.getLastReadMsgId(), sendTimeCache);
            ConversationReadStateVO.MemberReadState row = ConversationReadStateVO.MemberReadState.builder()
                    .userId(m.getUserId())
                    .lastReadMsgId(m.getLastReadMsgId())
                    .lastReadSendTime(st)
                    .lastReadAt(m.getLastReadAt())
                    .build();
            states.add(row);
            if (m.getUserId().equals(userId)) {
                myLast = m.getLastReadMsgId();
                mySend = st;
            } else if (c.getType() != null && c.getType() == 1) {
                peerLast = m.getLastReadMsgId();
                peerSend = st;
            }
        }
        return ConversationReadStateVO.builder()
                .conversationId(conversationId)
                .conversationType(c.getType())
                .readReceiptEnabled(true)
                .myLastReadMsgId(myLast)
                .myLastReadSendTime(mySend)
                .peerLastReadMsgId(peerLast)
                .peerLastReadSendTime(peerSend)
                .members(states)
                .build();
    }

    private boolean readReceiptEnabled(Long userId) {
        if (userId == null) {
            return true;
        }
        SysUser u = userMapper.selectById(userId);
        return u == null
                || u.getReadReceiptEnabled() == null
                || Boolean.TRUE.equals(u.getReadReceiptEnabled());
    }

    private Map<Long, Boolean> readReceiptFlags(List<Long> userIds) {
        Map<Long, Boolean> map = new HashMap<>();
        if (userIds == null || userIds.isEmpty()) {
            return map;
        }
        List<SysUser> users = userMapper.selectBatchIds(userIds);
        for (SysUser u : users) {
            map.put(u.getId(),
                    u.getReadReceiptEnabled() == null || Boolean.TRUE.equals(u.getReadReceiptEnabled()));
        }
        return map;
    }

    private ImMessage resolveReadTarget(Long conversationId, String lastReadMsgId) {
        if (StringUtils.hasText(lastReadMsgId)) {
            ImMessage m = messageMapper.selectOne(new LambdaQueryWrapper<ImMessage>()
                    .eq(ImMessage::getConversationId, conversationId)
                    .eq(ImMessage::getMsgId, lastReadMsgId.trim())
                    .last("LIMIT 1"));
            if (m != null) {
                return m;
            }
        }
        return messageMapper.selectOne(new LambdaQueryWrapper<ImMessage>()
                .eq(ImMessage::getConversationId, conversationId)
                .orderByDesc(ImMessage::getSendTime)
                .orderByDesc(ImMessage::getId)
                .last("LIMIT 1"));
    }

    private boolean shouldAdvanceRead(Long conversationId, String currentMsgId, ImMessage candidate) {
        if (candidate == null || !StringUtils.hasText(candidate.getMsgId())) {
            return false;
        }
        if (!StringUtils.hasText(currentMsgId)) {
            return true;
        }
        if (currentMsgId.equals(candidate.getMsgId())) {
            return false;
        }
        ImMessage current = messageMapper.selectOne(new LambdaQueryWrapper<ImMessage>()
                .eq(ImMessage::getConversationId, conversationId)
                .eq(ImMessage::getMsgId, currentMsgId)
                .last("LIMIT 1"));
        if (current == null) {
            return true;
        }
        OffsetDateTime ct = current.getSendTime();
        OffsetDateTime nt = candidate.getSendTime();
        if (ct == null) {
            return true;
        }
        if (nt == null) {
            return false;
        }
        int cmp = nt.compareTo(ct);
        if (cmp > 0) {
            return true;
        }
        if (cmp < 0) {
            return false;
        }
        Long cid = current.getId();
        Long nid = candidate.getId();
        return cid != null && nid != null && nid > cid;
    }

    private Long lookupMsgSendTimeMs(Long conversationId, String msgId) {
        return lookupMsgSendTimeMsCached(conversationId, msgId, null);
    }

    private Long lookupMsgSendTimeMsCached(Long conversationId, String msgId, Map<String, Long> cache) {
        if (!StringUtils.hasText(msgId)) {
            return null;
        }
        if (cache != null && cache.containsKey(msgId)) {
            return cache.get(msgId);
        }
        ImMessage m = messageMapper.selectOne(new LambdaQueryWrapper<ImMessage>()
                .eq(ImMessage::getConversationId, conversationId)
                .eq(ImMessage::getMsgId, msgId.trim())
                .last("LIMIT 1"));
        Long ms = null;
        if (m != null && m.getSendTime() != null) {
            ms = m.getSendTime().toInstant().toEpochMilli();
        }
        if (cache != null) {
            cache.put(msgId, ms);
        }
        return ms;
    }

    private void publishReadReceipt(Long conversationId, Long fromUserId, String lastReadMsgId, Long lastReadSendTime) {
        List<ImConversationMember> members = memberMapper.selectList(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId));
        long sendTime = lastReadSendTime == null ? System.currentTimeMillis() : lastReadSendTime;
        for (ImConversationMember mem : members) {
            // 同一账号可能同时登录手机、桌面网页和桌面客户端；已读状态也要回推给阅读者自己的其他设备。
            if (mem.getUserId() == null) {
                continue;
            }
            try {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("event", "read_receipt");
                payload.put("cmd", "READ_RECEIPT");
                payload.put("conversationId", conversationId);
                payload.put("fromUserId", fromUserId);
                payload.put("toUserId", mem.getUserId());
                payload.put("lastReadMsgId", lastReadMsgId);
                payload.put("lastReadSendTime", sendTime);
                payload.put("sendTime", System.currentTimeMillis());
                String json = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(payload);
                redis.convertAndSend(RedisKeys.IM_PUSH_CHANNEL, json);
            } catch (Exception ignored) {
                // 回执推送失败不影响主流程
            }
        }
    }

    @Transactional
    public void setUnread(Long userId, Long conversationId, int unread) {
        ImConversationMember member = requireMember(userId, conversationId);
        member.setUnreadCount(Math.max(0, unread));
        memberMapper.updateById(member);
    }

    @Transactional
    public void markAllRead(Long userId) {
        List<ImConversationMember> members = memberMapper.selectList(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getUserId, userId)
                .and(w -> w.isNull(ImConversationMember::getArchived).or().eq(ImConversationMember::getArchived, false))
                .gt(ImConversationMember::getUnreadCount, 0));
        for (ImConversationMember m : members) {
            markRead(userId, m.getConversationId(), null);
        }
    }

    @Transactional
    public void setArchived(Long userId, Long conversationId, boolean archived) {
        ImConversationMember member = requireMember(userId, conversationId);
        member.setArchived(archived);
        memberMapper.updateById(member);
    }

    @Transactional
    public void updateMemberSettings(
            Long userId, Long conversationId, Boolean pinned, Boolean mute, Boolean hidden,
            String groupNickname, String groupRemark) {
        ImConversationMember member = requireMember(userId, conversationId);
        if (pinned != null) {
            member.setPinned(pinned);
        }
        if (mute != null) {
            member.setMute(mute);
        }
        if (hidden != null) {
            member.setHidden(hidden);
            if (hidden) member.setUnreadCount(0);
        }
        if (groupNickname != null) {
            String value = groupNickname.trim();
            member.setGroupNickname(value.substring(0, Math.min(value.length(), 64)));
        }
        if (groupRemark != null) {
            String value = groupRemark.trim();
            member.setGroupRemark(value.substring(0, Math.min(value.length(), 64)));
        }
        memberMapper.updateById(member);
    }

    @Transactional
    public void removeConversation(Long userId, Long conversationId) {
        // 首页删除 = 对本端隐藏会话，保留成员关系；有新消息时再显示
        ImConversationMember member = requireMember(userId, conversationId);
        member.setHidden(true);
        member.setUnreadCount(0);
        member.setPinned(false);
        memberMapper.updateById(member);
    }

    @Transactional
    public void deletePrivateConversation(Long userId, Long conversationId, boolean forBoth) {
        ImConversation conversation = conversationMapper.selectById(conversationId);
        if (conversation == null || conversation.getType() == null || conversation.getType() != 1) {
            throw new BizException("仅支持删除好友私聊");
        }
        requireMember(userId, conversationId);

        List<ImConversationMember> members = memberMapper.selectList(
                new LambdaQueryWrapper<ImConversationMember>()
                        .eq(ImConversationMember::getConversationId, conversationId));
        for (ImConversationMember member : members) {
            if (!forBoth && !userId.equals(member.getUserId())) {
                continue;
            }
            messageHideMapper.hideAllInConversation(member.getUserId(), conversationId);
            member.setHidden(true);
            member.setUnreadCount(0);
            member.setPinned(false);
            member.setArchived(false);
            memberMapper.updateById(member);
        }
    }

    @Transactional
    public void clearGroupHistory(Long userId, Long conversationId, boolean forAll) {
        ImConversation conversation = conversationMapper.selectById(conversationId);
        if (conversation == null || conversation.getType() == null || conversation.getType() != 2) {
            throw new BizException("仅支持清除群聊记录");
        }
        ImConversationMember requester = requireMember(userId, conversationId);
        boolean owner = userId.equals(conversation.getOwnerId()) || "owner".equalsIgnoreCase(requester.getRole());
        if (forAll && !owner) {
            throw new BizException("仅群主可以双向清除群聊记录");
        }
        List<ImConversationMember> members = forAll
                ? memberMapper.selectList(new LambdaQueryWrapper<ImConversationMember>()
                        .eq(ImConversationMember::getConversationId, conversationId))
                : List.of(requester);
        for (ImConversationMember member : members) {
            messageHideMapper.hideAllInConversation(member.getUserId(), conversationId);
            member.setUnreadCount(0);
            member.setMentionUnread(false);
            memberMapper.updateById(member);
        }
    }

    /** 有新消息时取消隐藏并累加未读 */
    public void revealOnNewMessage(Long userId, Long conversationId, Long peerUserIdForPrivate) {
        ImConversationMember member = memberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, userId)
                .last("LIMIT 1"));
        if (member == null) {
            // 兼容旧版硬删成员：私聊补回成员行
            ImConversation c = conversationMapper.selectById(conversationId);
            if (c == null || c.getType() == null || c.getType() != 1) {
                return;
            }
            member = new ImConversationMember();
            member.setConversationId(conversationId);
            member.setUserId(userId);
            member.setPeerUserId(peerUserIdForPrivate);
            member.setUnreadCount(1);
            member.setMute(false);
            member.setArchived(false);
            member.setPinned(false);
            member.setHidden(false);
            member.setRole("member");
            member.setJoinedAt(OffsetDateTime.now());
            memberMapper.insert(member);
            return;
        }
        member.setHidden(false);
        member.setUnreadCount((member.getUnreadCount() == null ? 0 : member.getUnreadCount()) + 1);
        memberMapper.updateById(member);
    }

    @Transactional
    public void batchAction(Long userId, List<Long> ids, String action) {
        if (ids == null || ids.isEmpty()) {
            throw new BizException("请选择会话");
        }
        for (Long id : ids) {
            switch (action) {
                case "delete" -> removeConversation(userId, id);
                case "archive" -> setArchived(userId, id, true);
                case "unarchive" -> setArchived(userId, id, false);
                case "read" -> markRead(userId, id, null);
                case "unread" -> setUnread(userId, id, 1);
                default -> throw new BizException("不支持的操作");
            }
        }
    }

    private ImConversationMember requireMember(Long userId, Long conversationId) {
        ImConversationMember member = memberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, userId)
                .last("LIMIT 1"));
        if (member == null) {
            throw new BizException("会话不存在");
        }
        return member;
    }

    @Transactional
    public ConversationVO getOrCreatePrivate(Long userId, Long peerUserId) {
        if (peerUserId == null || peerUserId.equals(userId)) {
            throw new BizException("无效的聊天对象");
        }
        SysUser peer = userMapper.selectById(peerUserId);
        if (peer == null) {
            throw new BizException("用户不存在");
        }
        if (isBlockedEitherWay(userId, peerUserId)) {
            throw new BizException(isBlockedByMe(userId, peerUserId)
                    ? "已拉黑对方，无法发起聊天"
                    : "您已被对方拉入黑名单");
        }
        Long friendCnt = friendMapper.selectCount(new LambdaQueryWrapper<ImFriend>()
                .eq(ImFriend::getUserId, userId)
                .eq(ImFriend::getFriendId, peerUserId));
        if (friendCnt == null || friendCnt == 0) {
            throw new BizException("对方不是你好友，无法发起聊天");
        }

        Long sharedId = memberMapper.findSharedPrivateConversationId(userId, peerUserId);
        if (sharedId != null) {
            ensurePrivateMemberRow(sharedId, userId, peerUserId);
            ensurePrivateMemberRow(sharedId, peerUserId, userId);
            hidePrivateDuplicates(userId, peerUserId, sharedId);
            return withPeerOnline(
                    conversationMapper.listByUserId(userId).stream()
                            .filter(v -> sharedId.equals(v.getId()))
                            .findFirst()
                            .orElseGet(() -> buildSimpleVo(userId, sharedId, peer)),
                    userId,
                    peerUserId
            );
        }

        ImConversationMember existing = memberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getUserId, userId)
                .eq(ImConversationMember::getPeerUserId, peerUserId)
                .last("LIMIT 1"));
        if (existing != null) {
            if (Boolean.TRUE.equals(existing.getHidden())) {
                existing.setHidden(false);
                memberMapper.updateById(existing);
            }
            return withPeerOnline(
                    conversationMapper.listByUserId(userId).stream()
                            .filter(v -> existing.getConversationId().equals(v.getId()))
                            .findFirst()
                            .orElseGet(() -> buildSimpleVo(userId, existing.getConversationId(), peer)),
                    userId,
                    peerUserId
            );
        }

        // 兼容旧版硬删：对方仍有会话成员时，补回自己的成员行
        ImConversationMember peerSide = memberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getUserId, peerUserId)
                .eq(ImConversationMember::getPeerUserId, userId)
                .last("LIMIT 1"));
        if (peerSide != null) {
            ImConversationMember restored = new ImConversationMember();
            restored.setConversationId(peerSide.getConversationId());
            restored.setUserId(userId);
            restored.setPeerUserId(peerUserId);
            restored.setUnreadCount(0);
            restored.setMute(false);
            restored.setArchived(false);
            restored.setPinned(false);
            restored.setHidden(false);
            restored.setRole("member");
            restored.setJoinedAt(OffsetDateTime.now());
            memberMapper.insert(restored);
            return withPeerOnline(
                    conversationMapper.listByUserId(userId).stream()
                            .filter(v -> peerSide.getConversationId().equals(v.getId()))
                            .findFirst()
                            .orElseGet(() -> buildSimpleVo(userId, peerSide.getConversationId(), peer)),
                    userId,
                    peerUserId
            );
        }

        ImConversation c = new ImConversation();
        c.setType(1);
        c.setTitle(displayNameService.displayName(userId, peer, peerUserId));
        c.setAvatarUrl(peer.getAvatarUrl());
        c.setLastMsgPreview("开始聊天吧");
        c.setLastMsgTime(OffsetDateTime.now());
        c.setCreatedAt(OffsetDateTime.now());
        c.setUpdatedAt(OffsetDateTime.now());
        conversationMapper.insert(c);

        ImConversationMember m1 = new ImConversationMember();
        m1.setConversationId(c.getId());
        m1.setUserId(userId);
        m1.setPeerUserId(peerUserId);
        m1.setUnreadCount(0);
        m1.setMute(false);
        m1.setArchived(false);
        m1.setPinned(false);
        m1.setHidden(false);
        m1.setJoinedAt(OffsetDateTime.now());
        memberMapper.insert(m1);

        ImConversationMember m2 = new ImConversationMember();
        m2.setConversationId(c.getId());
        m2.setUserId(peerUserId);
        m2.setPeerUserId(userId);
        m2.setUnreadCount(0);
        m2.setMute(false);
        m2.setArchived(false);
        m2.setPinned(false);
        m2.setHidden(false);
        m2.setJoinedAt(OffsetDateTime.now());
        memberMapper.insert(m2);

        ConversationVO vo = buildSimpleVo(userId, c.getId(), peer);
        vo.setLastMsgPreview(c.getLastMsgPreview());
        vo.setLastMsgTime(c.getLastMsgTime());
        vo.setUnreadCount(0);
        boolean hidden = isPeerOnlineHidden(userId, peerUserId);
        vo.setOnlineHidden(hidden);
        vo.setOnline(!hidden && isPeerOnlineVisible(userId, peerUserId, null));
        return vo;
    }

    @Transactional
    public ConversationVO createGroup(Long ownerId, String title, List<Long> memberIds) {
        if (!StringUtils.hasText(title)) {
            throw new BizException("请输入群名称");
        }
        if (memberIds == null || memberIds.isEmpty()) {
            throw new BizException("请至少选择一位好友");
        }
        java.util.LinkedHashSet<Long> ids = new java.util.LinkedHashSet<>();
        ids.add(ownerId);
        for (Long id : memberIds) {
            if (id != null && !id.equals(ownerId) && !fileTransferAssistantService.isAssistant(id)) {
                ids.add(id);
            }
        }
        if (ids.size() < 2) {
            throw new BizException("请至少选择一位好友");
        }

        ImConversation c = new ImConversation();
        c.setType(2);
        c.setTitle(title.trim());
        c.setGroupPulseId(newGroupPulseId());
        c.setOwnerId(ownerId);
        c.setNotice("欢迎加入本群。请文明交流，遵守群规。");
        c.setMuteAll(false);
        c.setJoinVerifyRequired(false);
        c.setMemberFriendAllowed(true);
        c.setSearchMode(3);
        c.setMemberInviteAllowed(true);
        c.setLastMsgPreview("群聊已创建");
        c.setLastMsgTime(OffsetDateTime.now());
        c.setCreatedAt(OffsetDateTime.now());
        c.setUpdatedAt(OffsetDateTime.now());
        conversationMapper.insert(c);

        SysUser owner = userMapper.selectById(ownerId);
        for (Long uid : ids) {
            ImConversationMember m = new ImConversationMember();
            m.setConversationId(c.getId());
            m.setUserId(uid);
            m.setUnreadCount(0);
            m.setMute(false);
            m.setArchived(false);
            m.setPinned(false);
            m.setRole(uid.equals(ownerId) ? "owner" : "member");
            m.setJoinSource(uid.equals(ownerId) ? "create" : "create_invite");
            m.setJoinedAt(OffsetDateTime.now());
            memberMapper.insert(m);
            SysUser u = uid.equals(ownerId) ? owner : userMapper.selectById(uid);
            if (u != null) {
                groupMemberEventService.record(
                        c, u, owner,
                        "join",
                        m.getJoinSource(),
                        null,
                        uid.equals(ownerId) ? "创建群聊" : "建群时加入",
                        null
                );
            }
        }

        postGroupSystemTip(ownerId, c.getId(), "群聊已创建，可以开始聊天了！");

        ConversationVO vo = new ConversationVO();
        vo.setId(c.getId());
        vo.setType(2);
        vo.setTitle(c.getTitle());
        vo.setLastMsgPreview(c.getLastMsgPreview());
        vo.setLastMsgTime(c.getLastMsgTime());
        vo.setUnreadCount(0);
        vo.setOnline(false);
        return vo;
    }

    /**
     * 搜索允许公开检索的群聊。群号始终按精确匹配处理；群名称关键词只有
     * search_mode=3 时参与匹配。二维码和已知群号打开群简介不受此开关影响。
     */
    public List<GroupPreviewVO> searchPublicGroups(Long userId, String keyword) {
        String q = keyword == null ? "" : keyword.trim();
        if (!StringUtils.hasText(q)) {
            return List.of();
        }
        String lower = q.toLowerCase(java.util.Locale.ROOT);
        List<ImConversation> groups = conversationMapper.selectList(new LambdaQueryWrapper<ImConversation>()
                .eq(ImConversation::getType, 2)
                .orderByDesc(ImConversation::getUpdatedAt));
        List<GroupPreviewVO> result = new ArrayList<>();
        for (ImConversation c : groups) {
            int mode = c.getSearchMode() == null ? 3 : c.getSearchMode();
            if (mode == 1) continue;
            String pulseId = groupPulseId(c);
            boolean numberHit = q.equals(pulseId);
            boolean titleHit = mode == 3 && StringUtils.hasText(c.getTitle())
                    && c.getTitle().toLowerCase(java.util.Locale.ROOT).contains(lower);
            if (!numberHit && !titleHit) continue;
            result.add(toGroupPreview(userId, c));
            if (result.size() >= 30) break;
        }
        return result;
    }

    public GroupDetailVO getGroupDetail(Long userId, Long conversationId) {
        ImConversationMember mine = memberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, userId)
                .last("LIMIT 1"));
        if (mine == null) {
            throw new BizException("你不在该会话中");
        }
        ImConversation c = conversationMapper.selectById(conversationId);
        if (c == null) {
            throw new BizException("会话不存在");
        }
        if (c.getType() == null || c.getType() != 2) {
            throw new BizException("不是群聊");
        }
        // 旧群无 owner 时，用最早入群成员作为群主
        Long ownerId = resolveOwnerId(c, conversationId);
        String myRole = resolveMemberRole(mine, ownerId);

        List<ImConversationMember> members = memberMapper.selectList(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .orderByAsc(ImConversationMember::getJoinedAt));
        Map<Long, String> remarkByFriendId = new HashMap<>();
        Map<Long, String> tagByFriendId = new HashMap<>();
        if (!members.isEmpty()) {
            List<Long> memberUserIds = members.stream()
                    .map(ImConversationMember::getUserId)
                    .filter(id -> id != null && !id.equals(userId))
                    .distinct()
                    .toList();
            if (!memberUserIds.isEmpty()) {
                List<ImFriend> friendRows = friendMapper.selectList(new LambdaQueryWrapper<ImFriend>()
                        .eq(ImFriend::getUserId, userId)
                        .eq(ImFriend::getAddSource, "default_friend")
                        .in(ImFriend::getFriendId, memberUserIds));
                for (ImFriend fr : friendRows) {
                    if (fr.getFriendId() == null) continue;
                    if (StringUtils.hasText(fr.getRemark())) {
                        remarkByFriendId.put(fr.getFriendId(), fr.getRemark().trim());
                    }
                    if (StringUtils.hasText(fr.getTag())) {
                        tagByFriendId.put(fr.getFriendId(), fr.getTag().trim());
                    }
                }
            }
        }
        List<GroupDetailVO.GroupMemberVO> list = new ArrayList<>();
        for (ImConversationMember m : members) {
            SysUser u = userMapper.selectById(m.getUserId());
            if (u == null) continue;
            String role = resolveMemberRole(m, ownerId);
            boolean isOwner = "owner".equals(role);
            boolean isAdmin = isOwner || "admin".equals(role);
            String systemNick = u.getNickname();
            String groupNick = StringUtils.hasText(m.getGroupNickname()) ? m.getGroupNickname().trim() : null;
            String remark = remarkByFriendId.get(u.getId());
            String tag = tagByFriendId.get(u.getId());
            list.add(GroupDetailVO.GroupMemberVO.builder()
                    .userId(u.getId())
                    .nickname(systemNick)
                    .groupNickname(StringUtils.hasText(groupNick) ? groupNick : systemNick)
                    .remark(remark)
                    .tag(tag)
                    .avatarUrl(u.getAvatarUrl())
                    .role(role)
                    .owner(isOwner)
                    .admin(isAdmin)
                    .speakMuted(Boolean.TRUE.equals(m.getSpeakMuted()))
                    .build());
        }
        // 群主优先，其次管理员，再按入群时间
        list.sort((a, b) -> {
            int ra = roleRank(a.getRole());
            int rb = roleRank(b.getRole());
            if (ra != rb) return Integer.compare(rb, ra);
            return 0;
        });
        boolean isOwner = "owner".equals(myRole);
        boolean isAdmin = isOwner || "admin".equals(myRole);
        SysUser welcomeSetter = c.getGroupWelcomeSetterId() == null
                ? null : userMapper.selectById(c.getGroupWelcomeSetterId());
        return GroupDetailVO.builder()
                .id(c.getId())
                .title(c.getTitle())
                .pulseId(groupPulseId(c))
                .avatarUrl(c.getAvatarUrl())
                .notice(StringUtils.hasText(c.getNotice()) ? c.getNotice() : "欢迎加入本群。请文明交流，遵守群规。")
                .welcomeMessage(c.getGroupWelcomeMessage())
                .welcomeSetterId(c.getGroupWelcomeSetterId())
                .welcomeSetterNickname(welcomeSetter == null ? null : welcomeSetter.getNickname())
                .welcomeSetterAvatarUrl(welcomeSetter == null ? null : welcomeSetter.getAvatarUrl())
                .ownerId(ownerId)
                .owner(isOwner)
                .admin(isAdmin)
                .myRole(myRole)
                .myGroupNickname(StringUtils.hasText(mine.getGroupNickname())
                        ? mine.getGroupNickname()
                        : userMapper.selectById(userId).getNickname())
                .groupRemark(mine.getGroupRemark())
                .hidden(Boolean.TRUE.equals(mine.getHidden()))
                .pinned(Boolean.TRUE.equals(mine.getPinned()))
                .mute(Boolean.TRUE.equals(mine.getMute()))
                .muteAll(Boolean.TRUE.equals(c.getMuteAll()))
                .joinVerifyRequired(Boolean.TRUE.equals(c.getJoinVerifyRequired()))
                .memberFriendAllowed(c.getMemberFriendAllowed() == null || Boolean.TRUE.equals(c.getMemberFriendAllowed()))
                .searchMode(c.getSearchMode() == null ? 3 : c.getSearchMode())
                .memberInviteAllowed(c.getMemberInviteAllowed() == null || Boolean.TRUE.equals(c.getMemberInviteAllowed()))
                .speakMuted(Boolean.TRUE.equals(mine.getSpeakMuted()))
                .memberCount(list.size())
                .pendingJoinCount(isAdmin ? countPendingJoinRequests(conversationId) : 0)
                .members(list)
                .build();
    }

    /** 群简介（非成员也可查看，用于名片/扫码加群） */
    public GroupPreviewVO getGroupPreview(Long userId, Long conversationId) {
        ImConversation c = conversationMapper.selectById(conversationId);
        if (c == null) {
            throw new BizException("群聊不存在");
        }
        if (c.getType() == null || c.getType() != 2) {
            throw new BizException("不是群聊");
        }
        Long joinedCnt = memberMapper.selectCount(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, userId));
        boolean joined = joinedCnt != null && joinedCnt > 0;
        Long memberCount = memberMapper.selectCount(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId));
        Long ownerId = resolveOwnerId(c, conversationId);
        String ownerNickname = null;
        if (ownerId != null) {
            SysUser owner = userMapper.selectById(ownerId);
            if (owner != null) ownerNickname = owner.getNickname();
        }
        return toGroupPreview(userId, c);
    }

    private GroupPreviewVO toGroupPreview(Long userId, ImConversation c) {
        Long conversationId = c.getId();
        Long joinedCnt = memberMapper.selectCount(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, userId));
        boolean joined = joinedCnt != null && joinedCnt > 0;
        Long memberCount = memberMapper.selectCount(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId));
        Long ownerId = resolveOwnerId(c, conversationId);
        String ownerNickname = null;
        if (ownerId != null) {
            SysUser owner = userMapper.selectById(ownerId);
            if (owner != null) ownerNickname = owner.getNickname();
        }
        return GroupPreviewVO.builder()
                .id(c.getId())
                .pulseId(groupPulseId(c))
                .title(StringUtils.hasText(c.getTitle()) ? c.getTitle() : "群聊")
                .avatarUrl(c.getAvatarUrl())
                .notice(StringUtils.hasText(c.getNotice()) ? c.getNotice() : "欢迎加入本群。请文明交流，遵守群规。")
                .memberCount(memberCount == null ? 0 : memberCount.intValue())
                .joined(joined)
                .joinVerifyRequired(Boolean.TRUE.equals(c.getJoinVerifyRequired()))
                .joinPending(hasPendingJoinRequest(conversationId, userId))
                .ownerNickname(ownerNickname)
                .build();
    }

    String groupPulseId(ImConversation conversation) {
        return conversation == null || !StringUtils.hasText(conversation.getGroupPulseId())
                ? "" : conversation.getGroupPulseId().trim();
    }

    private String newGroupPulseId() {
        // Ten digits retain the familiar group-number input while making the
        // public identifier independent from the auto-increment conversation ID.
        return String.valueOf(1_000_000_000L
                + Math.floorMod(GROUP_PULSE_RANDOM.nextLong(), 9_000_000_000L));
    }

    /** 通过名片/扫码主动加入群聊（可能进入待审核） */
    @Transactional
    public GroupJoinResultVO joinGroup(Long userId, Long conversationId, String source, String message) {
        ImConversation c = requireGroup(conversationId);
        ImConversationMember existing = memberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, userId)
                .last("LIMIT 1"));
        if (existing != null) {
            existing.setHidden(false);
            existing.setArchived(false);
            memberMapper.updateById(existing);
            return GroupJoinResultVO.builder()
                    .joined(true)
                    .pending(false)
                    .message("已在群内")
                    .conversation(toConversationVOForUser(userId, c, existing))
                    .build();
        }
        SysUser u = userMapper.selectById(userId);
        if (u == null) {
            throw new BizException("用户不存在");
        }
        String normalizedSource = normalizeJoinSource(source, "join");
        if (Boolean.TRUE.equals(c.getJoinVerifyRequired())) {
            boolean alreadyPending = hasPendingJoinRequest(conversationId, userId);
            ImGroupJoinRequest req = createOrRefreshJoinRequest(
                    conversationId, userId, null, message, normalizedSource, "admin");
            if (!alreadyPending) {
                groupMemberEventService.record(c, u, null, "apply", normalizedSource, message, "等待群主/管理员审核", req.getId());
            }
            return GroupJoinResultVO.builder()
                    .joined(false)
                    .pending(true)
                    .requestId(req.getId())
                    .message("已提交加群申请，等待群主/管理员审核")
                    .build();
        }
        ConversationVO vo = doAddMemberAndTip(c, u, normalizedSource, null, null, null, "直接加入");
        return GroupJoinResultVO.builder()
                .joined(true)
                .pending(false)
                .message("已加入群聊")
                .conversation(vo)
                .build();
    }

    private ConversationVO toConversationVOForUser(Long userId, ImConversation c, ImConversationMember m) {
        ConversationVO vo = new ConversationVO();
        vo.setId(c.getId());
        vo.setType(c.getType());
        vo.setTitle(c.getTitle());
        vo.setAvatarUrl(c.getAvatarUrl());
        vo.setLastMsgPreview(c.getLastMsgPreview());
        vo.setLastMsgTime(c.getLastMsgTime());
        vo.setUnreadCount(m.getUnreadCount() == null ? 0 : m.getUnreadCount());
        vo.setPeerUserId(null);
        vo.setFileTransferAssistant(false);
        vo.setOnline(false);
        vo.setArchived(Boolean.TRUE.equals(m.getArchived()));
        vo.setPinned(Boolean.TRUE.equals(m.getPinned()));
        vo.setMute(Boolean.TRUE.equals(m.getMute()));
        vo.setMentionUnread(Boolean.TRUE.equals(m.getMentionUnread()));
        return vo;
    }

    @Transactional
    public void updateGroupTitle(Long userId, Long conversationId, String title) {
        if (!StringUtils.hasText(title)) {
            throw new BizException("群名称不能为空");
        }
        ImConversation c = requireGroup(conversationId);
        assertOwnerOrAdmin(userId, c);
        String next = title.trim();
        c.setTitle(next);
        c.setUpdatedAt(OffsetDateTime.now());
        conversationMapper.updateById(c);
        postGroupSystemTip(userId, conversationId, "群名称已修改为「" + next + "」");
    }

    @Transactional
    public void updateGroupNotice(Long userId, Long conversationId, String notice) {
        ImConversation c = requireGroup(conversationId);
        assertOwnerOrAdmin(userId, c);
        String next = notice == null ? "" : notice.trim();
        c.setNotice(next);
        c.setUpdatedAt(OffsetDateTime.now());
        conversationMapper.updateById(c);
        if (StringUtils.hasText(next)) {
            String preview = next.length() > 40 ? next.substring(0, 40) + "…" : next;
            postGroupSystemTip(userId, conversationId, "已更新群公告：" + preview);
        } else {
            postGroupSystemTip(userId, conversationId, "已清空群公告");
        }
    }

    /** 校验当前用户是群主或管理员，供群自动化管理接口复用。 */
    public ImConversation requireGroupManager(Long userId, Long conversationId) {
        ImConversation c = requireGroup(conversationId);
        assertOwnerOrAdmin(userId, c);
        return c;
    }

    @Transactional
    public void updateGroupAvatar(Long userId, Long conversationId, String avatarUrl) {
        ImConversation c = requireGroup(conversationId);
        assertOwnerOrAdmin(userId, c);
        if (!StringUtils.hasText(avatarUrl)) {
            throw new BizException("头像不能为空");
        }
        String url = avatarUrl.trim();
        boolean localUpload = url.startsWith("/api/v1/files/raw/")
                && !url.contains("..")
                && url.indexOf('/', "/api/v1/files/raw/".length()) < 0;
        if (!(url.startsWith("http://") || url.startsWith("https://")
                || url.startsWith("data:image/") || localUpload)) {
            throw new BizException("头像地址无效");
        }
        c.setAvatarUrl(url);
        c.setUpdatedAt(OffsetDateTime.now());
        conversationMapper.updateById(c);
        postGroupSystemTip(userId, conversationId, "已更新群头像");
    }

    @Transactional
    public void setMemberRole(Long operatorId, Long conversationId, Long targetUserId, String role) {
        ImConversation c = requireGroup(conversationId);
        assertOwner(operatorId, c);
        if (targetUserId == null) {
            throw new BizException("无效成员");
        }
        Long ownerId = resolveOwnerId(c, conversationId);
        if (ownerId != null && ownerId.equals(targetUserId)) {
            throw new BizException("不能修改群主角色");
        }
        String next = role == null ? "" : role.trim().toLowerCase();
        if (!"admin".equals(next) && !"member".equals(next)) {
            throw new BizException("角色仅支持管理员或普通成员");
        }
        ImConversationMember target = memberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, targetUserId)
                .last("LIMIT 1"));
        if (target == null) {
            throw new BizException("对方不在群中");
        }
        String prev = resolveMemberRole(target, ownerId);
        target.setRole(next);
        if ("admin".equals(next)) {
            target.setSpeakMuted(false);
        }
        memberMapper.updateById(target);
        if (!next.equals(prev)) {
            SysUser targetUser = userMapper.selectById(targetUserId);
            SysUser operator = userMapper.selectById(operatorId);
            if (targetUser != null) {
                groupMemberEventService.record(
                        c, targetUser, operator,
                        "admin".equals(next) ? "role_admin" : "role_member",
                        "role", null,
                        "admin".equals(next) ? "被设为群管理员" : "已取消群管理员", null);
            }
            String name = userDisplayName(targetUserId);
            postGroupSystemTip(
                    operatorId,
                    conversationId,
                    "admin".equals(next)
                            ? ("「" + name + "」被设为管理员")
                            : ("「" + name + "」已取消管理员")
            );
        }
    }

    /** 全员禁言开关（仅群主/管理员） */
    @Transactional
    public void setGroupMuteAll(Long operatorId, Long conversationId, boolean muteAll) {
        ImConversation c = requireGroup(conversationId);
        assertOwnerOrAdmin(operatorId, c);
        c.setMuteAll(muteAll);
        c.setUpdatedAt(OffsetDateTime.now());
        conversationMapper.updateById(c);
        postGroupSystemTip(operatorId, conversationId, muteAll ? "已开启全员禁言" : "已关闭全员禁言");
    }

    /** 加群审核开关（仅群主/管理员） */
    @Transactional
    public void setJoinVerifyRequired(Long operatorId, Long conversationId, boolean required) {
        ImConversation c = requireGroup(conversationId);
        assertOwnerOrAdmin(operatorId, c);
        c.setJoinVerifyRequired(required);
        c.setUpdatedAt(OffsetDateTime.now());
        conversationMapper.updateById(c);
        postGroupSystemTip(operatorId, conversationId, required ? "已开启加群审核" : "已关闭加群审核");
    }

    @Transactional
    public void setMemberFriendAllowed(Long operatorId, Long conversationId, boolean allowed) {
        ImConversation c = requireGroup(conversationId);
        assertOwnerOrAdmin(operatorId, c);
        c.setMemberFriendAllowed(allowed);
        c.setUpdatedAt(OffsetDateTime.now());
        conversationMapper.updateById(c);
        postGroupSystemTip(operatorId, conversationId,
                allowed ? "已允许群成员互加好友" : "已禁止群成员互加好友");
    }

    @Transactional
    public void setGroupSearchMode(Long operatorId, Long conversationId, int searchMode) {
        ImConversation c = requireGroup(conversationId);
        assertOwner(operatorId, c);
        if (searchMode < 1 || searchMode > 3) {
            throw new BizException("群搜索方式无效");
        }
        c.setSearchMode(searchMode);
        c.setUpdatedAt(OffsetDateTime.now());
        conversationMapper.updateById(c);
    }

    @Transactional
    public void setMemberInviteAllowed(Long operatorId, Long conversationId, boolean allowed) {
        ImConversation c = requireGroup(conversationId);
        assertOwnerOrAdmin(operatorId, c);
        c.setMemberInviteAllowed(allowed);
        c.setUpdatedAt(OffsetDateTime.now());
        conversationMapper.updateById(c);
        postGroupSystemTip(operatorId, conversationId,
                allowed ? "已允许群成员邀请好友进群" : "已禁止群成员邀请好友进群");
    }

    public ImportantNotificationSettingVO getImportantNotificationSetting(Long userId, Long conversationId) {
        requireGroup(conversationId);
        ImConversationMember member = requireMember(userId, conversationId);
        return ImportantNotificationSettingVO.builder()
                .atAll(member.getImportantAtAll() == null || Boolean.TRUE.equals(member.getImportantAtAll()))
                .mentionMe(member.getImportantMentionMe() == null || Boolean.TRUE.equals(member.getImportantMentionMe()))
                .replyMe(member.getImportantReplyMe() == null || Boolean.TRUE.equals(member.getImportantReplyMe()))
                .announcement(member.getImportantAnnouncement() == null || Boolean.TRUE.equals(member.getImportantAnnouncement()))
                .followedMemberIds(parseFollowedMemberIds(member.getImportantFollowedMemberIds()))
                .build();
    }

    @Transactional
    public void updateImportantNotificationSetting(
            Long userId,
            Long conversationId,
            Boolean atAll,
            Boolean mentionMe,
            Boolean replyMe,
            Boolean announcement,
            List<Long> followedMemberIds
    ) {
        requireGroup(conversationId);
        ImConversationMember member = requireMember(userId, conversationId);
        if (atAll != null) member.setImportantAtAll(atAll);
        if (mentionMe != null) member.setImportantMentionMe(mentionMe);
        if (replyMe != null) member.setImportantReplyMe(replyMe);
        if (announcement != null) member.setImportantAnnouncement(announcement);
        if (followedMemberIds != null) {
            List<ImConversationMember> members = memberMapper.selectList(new LambdaQueryWrapper<ImConversationMember>()
                    .eq(ImConversationMember::getConversationId, conversationId));
            Set<Long> validIds = members.stream().map(ImConversationMember::getUserId)
                    .filter(java.util.Objects::nonNull).collect(java.util.stream.Collectors.toSet());
            String joined = followedMemberIds.stream()
                    .filter(java.util.Objects::nonNull)
                    .filter(validIds::contains)
                    .distinct()
                    .map(String::valueOf)
                    .collect(java.util.stream.Collectors.joining(","));
            member.setImportantFollowedMemberIds(joined);
        }
        memberMapper.updateById(member);
    }

    private List<Long> parseFollowedMemberIds(String raw) {
        if (!StringUtils.hasText(raw)) return List.of();
        List<Long> ids = new ArrayList<>();
        for (String token : raw.split(",")) {
            try {
                long id = Long.parseLong(token.trim());
                if (id > 0 && !ids.contains(id)) ids.add(id);
            } catch (Exception ignored) {
                // ignore malformed legacy values
            }
        }
        return ids;
    }

    /** 禁言 / 取消禁言指定成员（群主可禁言管理员；管理员仅可禁言普通成员） */
    @Transactional
    public void setMemberSpeakMuted(Long operatorId, Long conversationId, Long targetUserId, boolean speakMuted) {
        ImConversation c = requireGroup(conversationId);
        assertOwnerOrAdmin(operatorId, c);
        if (targetUserId == null) {
            throw new BizException("无效成员");
        }
        if (targetUserId.equals(operatorId)) {
            throw new BizException("不能禁言自己");
        }
        Long ownerId = resolveOwnerId(c, conversationId);
        if (ownerId != null && ownerId.equals(targetUserId)) {
            throw new BizException("不能禁言群主");
        }
        ImConversationMember op = requireMember(operatorId, conversationId);
        ImConversationMember target = memberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, targetUserId)
                .last("LIMIT 1"));
        if (target == null) {
            throw new BizException("对方不在群中");
        }
        String opRole = resolveMemberRole(op, ownerId);
        String targetRole = resolveMemberRole(target, ownerId);
        if ("admin".equals(opRole) && !"member".equals(targetRole)) {
            throw new BizException("管理员仅可禁言普通成员");
        }
        target.setSpeakMuted(speakMuted);
        memberMapper.updateById(target);
        SysUser targetUser = userMapper.selectById(targetUserId);
        String name = targetUser != null && StringUtils.hasText(targetUser.getNickname())
                ? targetUser.getNickname()
                : ("用户" + targetUserId);
        postGroupSystemTip(
                operatorId,
                conversationId,
                speakMuted ? ("「" + name + "」已被禁言") : ("「" + name + "」已解除禁言")
        );
    }

    /** 群系统提示（msgType=9），全员可见 */
    public void postGroupSystemTip(Long operatorId, Long conversationId, String content) {
        if (!StringUtils.hasText(content)) {
            return;
        }
        ImConversation c = conversationMapper.selectById(conversationId);
        String persistedContent = decorateGroupSystemTip(c, operatorId, content.trim());
        ImMessage m = new ImMessage();
        m.setMsgId(java.util.UUID.randomUUID().toString().replace("-", ""));
        m.setConversationId(conversationId);
        m.setFromUserId(operatorId);
        m.setMsgType(9);
        m.setContent(persistedContent);
        m.setRecalled(false);
        m.setScheduledMessage(false);
        m.setSendTime(OffsetDateTime.now());
        messageMapper.insert(m);

        if (c != null) {
            String preview = persistedContent;
            if (preview.startsWith("{")) {
                try {
                    String structuredText = new com.fasterxml.jackson.databind.ObjectMapper()
                            .readTree(preview).path("text").asText("");
                    if (StringUtils.hasText(structuredText)) preview = structuredText;
                } catch (Exception ignored) {
                    // 非结构化系统消息继续显示原文
                }
            }
            c.setLastMsgPreview(preview);
            c.setLastMsgTime(OffsetDateTime.now());
            c.setUpdatedAt(OffsetDateTime.now());
            conversationMapper.updateById(c);
        }

        List<ImConversationMember> members = memberMapper.selectList(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId));
        for (ImConversationMember mem : members) {
            if (mem.getUserId() == null) continue;
            if (!mem.getUserId().equals(operatorId)) {
                mem.setHidden(false);
                mem.setUnreadCount((mem.getUnreadCount() == null ? 0 : mem.getUnreadCount()) + 1);
                memberMapper.updateById(mem);
            }
            publishSystemTipPush(m, mem.getUserId());
        }
    }

    /**
     * Group system messages need an operator identity even when the caller
     * supplied a legacy plain-text tip. Keep the original text in a small JSON
     * envelope so both web clients can render "群主/管理员 + nickname".
     */
    private String decorateGroupSystemTip(ImConversation conversation, Long operatorId, String content) {
        if (conversation == null || conversation.getType() == null || conversation.getType() != 2) {
            return content;
        }
        content = normalizeGroupSystemText(content);
        String role = "member";
        Long ownerId = resolveOwnerId(conversation, conversation.getId());
        if (operatorId != null && operatorId.equals(ownerId)) {
            role = "owner";
        } else if (operatorId != null) {
            ImConversationMember operator = memberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                    .eq(ImConversationMember::getConversationId, conversation.getId())
                    .eq(ImConversationMember::getUserId, operatorId)
                    .last("LIMIT 1"));
            role = resolveMemberRole(operator, ownerId);
        }
        String actorName = userDisplayName(operatorId);
        try {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            com.fasterxml.jackson.databind.node.ObjectNode payload;
            if (content.startsWith("{")) {
                com.fasterxml.jackson.databind.JsonNode parsed = mapper.readTree(content);
                payload = parsed != null && parsed.isObject()
                        ? (com.fasterxml.jackson.databind.node.ObjectNode) parsed
                        : mapper.createObjectNode();
            } else {
                payload = mapper.createObjectNode();
                payload.put("kind", "group_action");
                payload.put("text", content);
            }
            if (!payload.hasNonNull("text")) payload.put("text", content);
            payload.put("actorId", operatorId == null ? "" : String.valueOf(operatorId));
            payload.put("actorName", actorName);
            payload.put("actorRole", role);
            payload.put("actorTitle", "owner".equals(role) ? "\u7fa4\u4e3b" : "admin".equals(role) ? "\u7ba1\u7406\u5458" : "\u7fa4\u6210\u5458");
            return mapper.writeValueAsString(payload);
        } catch (Exception ignored) {
            return content;
        }
    }

    private String normalizeGroupSystemText(String content) {
        return content
                .replaceFirst("^群名称已修改为", "修改了群名称为")
                .replaceFirst("^已更新群公告[：:]", "修改了群公告：")
                .replaceFirst("^已清空群公告", "清空了群公告")
                .replaceFirst("^已设置群聊欢迎语", "设置了群聊欢迎语")
                .replaceFirst("^已修改群聊欢迎语", "修改了群聊欢迎语")
                .replaceFirst("^已清空群聊欢迎语", "清空了群聊欢迎语")
                .replaceFirst("^已更新群头像", "修改了群头像")
                .replaceFirst("^已开启全员禁言", "开启了全员禁言")
                .replaceFirst("^已关闭全员禁言", "关闭了全员禁言")
                .replaceFirst("^已开启加群审核", "开启了加群审核")
                .replaceFirst("^已关闭加群审核", "关闭了加群审核")
                .replaceFirst("^已允许群成员互加好友", "允许了群成员互加好友")
                .replaceFirst("^已禁止群成员互加好友", "禁止了群成员互加好友");
    }

    public void postAutoDeleteSystemTip(Long operatorId, Long conversationId, boolean enabled, int seconds) {
        SysUser actor = userMapper.selectById(operatorId);
        String actorName = actor == null || !StringUtils.hasText(actor.getNickname())
                ? "对方" : actor.getNickname().trim();
        String period = formatAutoDeletePeriod(seconds);
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("kind", "auto_delete_setting");
        content.put("actorId", operatorId);
        content.put("actorName", actorName);
        content.put("enabled", enabled);
        content.put("ttlSeconds", seconds);
        content.put("text", enabled
                ? actorName + "已开启自动删除记录，双方发送的新消息，都会在" + period + "后从双方的聊天记录中删除"
                : actorName + "已关闭自动删除记录");
        try {
            postGroupSystemTip(operatorId, conversationId,
                    new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(content));
        } catch (Exception e) {
            try {
                postGroupSystemTip(operatorId, conversationId, String.valueOf(content.get("text")));
            } catch (Exception ignored) {
                // The setting update itself should not fail if the optional
                // system-tip message cannot be persisted.
            }
        }
    }

    public void postBurnSystemTip(Long operatorId, Long conversationId, boolean enabled, int seconds) {
        SysUser actor = userMapper.selectById(operatorId);
        String actorName = actor == null || !StringUtils.hasText(actor.getNickname())
                ? "对方" : actor.getNickname().trim();
        String period = formatBurnPeriod(seconds);
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("kind", "burn_setting");
        content.put("actorId", operatorId);
        content.put("actorName", actorName);
        content.put("enabled", enabled);
        content.put("burnSeconds", seconds);
        content.put("text", enabled
                ? actorName + "开启了阅后即焚，消息将在阅读后" + period + "销毁"
                : actorName + "关闭了阅后即焚");
        try {
            postGroupSystemTip(operatorId, conversationId,
                    new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(content));
        } catch (Exception e) {
            try {
                postGroupSystemTip(operatorId, conversationId, String.valueOf(content.get("text")));
            } catch (Exception ignored) {
                // The setting update itself should not fail if the optional
                // system-tip message cannot be persisted.
            }
        }
    }

    private String formatBurnPeriod(int seconds) {
        if (seconds <= 0) return "立即";
        return Math.max(1, seconds) + "秒后";
    }

    private String formatAutoDeletePeriod(int seconds) {
        if (seconds == 86400) return "1天";
        if (seconds == 604800) return "7天";
        if (seconds == 2592000) return "一个月";
        if (seconds % 86400 == 0) return (seconds / 86400) + "天";
        if (seconds % 3600 == 0) return (seconds / 3600) + "小时";
        return Math.max(1, seconds / 60) + "分钟";
    }

    private void publishSystemTipPush(ImMessage m, Long toUserId) {
        try {
            ImConversation conversation = conversationMapper.selectById(m.getConversationId());
            ImConversationMember recipient = memberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                    .eq(ImConversationMember::getConversationId, m.getConversationId())
                    .eq(ImConversationMember::getUserId, toUserId)
                    .last("LIMIT 1"));
            boolean notificationAllowed = recipient == null || !Boolean.TRUE.equals(recipient.getMute())
                    || conversation == null || conversation.getType() == null || conversation.getType() != 2
                    || (isAnnouncementSystemTip(m.getContent())
                        && (recipient.getImportantAnnouncement() == null
                            || Boolean.TRUE.equals(recipient.getImportantAnnouncement())));
            java.util.Map<String, Object> payload = new java.util.LinkedHashMap<>();
            payload.put("event", "message");
            payload.put("cmd", "PUSH_MSG");
            payload.put("msgId", m.getMsgId() == null ? "" : m.getMsgId());
            payload.put("id", m.getMsgId() == null ? "" : m.getMsgId());
            payload.put("conversationId", m.getConversationId());
            payload.put("fromUserId", m.getFromUserId());
            payload.put("fromNickname", "");
            payload.put("fromAvatarUrl", "");
            payload.put("toUserId", toUserId);
            payload.put("msgType", 9);
            payload.put("content", m.getContent() == null ? "" : m.getContent());
            payload.put("clientMsgId", "");
            payload.put(
                    "sendTime",
                    m.getSendTime() == null ? System.currentTimeMillis() : m.getSendTime().toInstant().toEpochMilli());
            payload.put("recalled", false);
            payload.put("notificationAllowed", notificationAllowed);
            String json = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(payload);
            redis.convertAndSend(RedisKeys.IM_PUSH_CHANNEL, json);
        } catch (Exception ignored) {
            // 提示推送失败不影响主流程
        }
    }

    private boolean isAnnouncementSystemTip(String content) {
        return content != null && content.contains("公告");
    }

    /**
     * 默认好友首次建立关系后发送的普通文本消息。clientMsgId 按双方固定，
     * 即使注册或后台保存流程重试也不会重复生成。
     */
    @Transactional
    public void sendDefaultFriendGreeting(Long fromUserId, Long toUserId, String content) {
        if (fromUserId == null || toUserId == null || fromUserId.equals(toUserId)
                || !StringUtils.hasText(content)) return;
        ConversationVO conversation = getOrCreatePrivate(fromUserId, toUserId);
        String clientMsgId = "default_friend_greeting_" + fromUserId + "_" + toUserId;
        Long exists = messageMapper.selectCount(new LambdaQueryWrapper<ImMessage>()
                .eq(ImMessage::getClientMsgId, clientMsgId));
        if (exists != null && exists > 0) return;

        ImMessage message = new ImMessage();
        message.setMsgId(java.util.UUID.randomUUID().toString().replace("-", ""));
        message.setConversationId(conversation.getId());
        message.setFromUserId(fromUserId);
        message.setMsgType(0);
        message.setContent(content.trim());
        message.setClientMsgId(clientMsgId);
        message.setRecalled(false);
        message.setSendTime(OffsetDateTime.now());
        messageMapper.insert(message);

        ImConversation row = conversationMapper.selectById(conversation.getId());
        if (row != null) {
            row.setLastMsgPreview(message.getContent());
            row.setLastMsgTime(message.getSendTime());
            row.setUpdatedAt(message.getSendTime());
            conversationMapper.updateById(row);
        }
        ImConversationMember recipient = memberMapper.selectOne(
                new LambdaQueryWrapper<ImConversationMember>()
                        .eq(ImConversationMember::getConversationId, conversation.getId())
                        .eq(ImConversationMember::getUserId, toUserId)
                        .last("LIMIT 1"));
        if (recipient != null) {
            recipient.setHidden(false);
            recipient.setUnreadCount((recipient.getUnreadCount() == null ? 0 : recipient.getUnreadCount()) + 1);
            memberMapper.updateById(recipient);
        }
    }

    @Transactional
    public void addGroupMembers(Long userId, Long conversationId, List<Long> memberIds) {
        assertGroupMember(userId, conversationId);
        ImConversation c = requireGroup(conversationId);
        if (!isOwnerOrAdmin(userId, c) && Boolean.FALSE.equals(c.getMemberInviteAllowed())) {
            throw new BizException("群主已禁止群成员邀请好友进群");
        }
        if (memberIds == null || memberIds.isEmpty()) {
            throw new BizException("请选择要添加的成员");
        }
        SysUser operator = userMapper.selectById(userId);
        boolean manager = isOwnerOrAdmin(userId, c);
        boolean needVerify = Boolean.TRUE.equals(c.getJoinVerifyRequired()) && !manager;
        int invited = 0;
        int applied = 0;
        int pendingInvitee = 0;
        for (Long uid : memberIds) {
            if (uid == null || uid.equals(userId)) continue;
            if (fileTransferAssistantService.isAssistant(uid)) continue;
            Long exists = memberMapper.selectCount(new LambdaQueryWrapper<ImConversationMember>()
                    .eq(ImConversationMember::getConversationId, conversationId)
                    .eq(ImConversationMember::getUserId, uid));
            if (exists != null && exists > 0) continue;
            SysUser u = userMapper.selectById(uid);
            if (u == null) continue;
            if (Boolean.TRUE.equals(u.getGroupInviteVerify())) {
                boolean alreadyPending = hasPendingJoinRequest(conversationId, uid);
                ImGroupJoinRequest req = createOrRefreshJoinRequest(
                        conversationId, uid, userId, null, "invite_confirm", "invitee");
                if (!alreadyPending) {
                    groupMemberEventService.record(
                            c, u, operator, "apply", "invite_confirm", null, "邀请入群，等待对方确认", req.getId());
                }
                pendingInvitee++;
            } else if (needVerify) {
                boolean alreadyPending = hasPendingJoinRequest(conversationId, uid);
                ImGroupJoinRequest req = createOrRefreshJoinRequest(
                        conversationId, uid, userId, null, "invite", "admin");
                if (!alreadyPending) {
                    groupMemberEventService.record(c, u, operator, "apply", "invite", null, "邀请入群，等待审核", req.getId());
                }
                applied++;
            } else {
                doAddMemberAndTip(c, u, "invite", operator, null, null, manager ? "管理员邀请加入" : "群成员邀请加入");
                invited++;
            }
        }
        if (invited == 0 && applied == 0 && pendingInvitee == 0) {
            return;
        }
        if (pendingInvitee > 0 && invited == 0 && applied == 0) {
            c.setLastMsgPreview("已发出群邀请，等待对方确认");
        } else if (applied > 0 && invited == 0 && pendingInvitee == 0) {
            c.setLastMsgPreview("有成员邀请，待管理员审核");
        } else {
            c.setLastMsgPreview("有新成员加入群聊");
        }
        c.setLastMsgTime(OffsetDateTime.now());
        c.setUpdatedAt(OffsetDateTime.now());
        conversationMapper.updateById(c);
    }

    @Transactional
    public void removeGroupMember(Long operatorId, Long conversationId, Long targetUserId) {
        ImConversation c = requireGroup(conversationId);
        assertOwnerOrAdmin(operatorId, c);
        if (targetUserId == null) {
            throw new BizException("无效成员");
        }
        Long ownerId = resolveOwnerId(c, conversationId);
        if (ownerId != null && ownerId.equals(targetUserId)) {
            throw new BizException("不能移除群主");
        }
        ImConversationMember op = requireMember(operatorId, conversationId);
        ImConversationMember target = memberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, targetUserId)
                .last("LIMIT 1"));
        if (target == null) {
            throw new BizException("对方不在群中");
        }
        String opRole = resolveMemberRole(op, ownerId);
        String targetRole = resolveMemberRole(target, ownerId);
        if ("admin".equals(opRole) && !"member".equals(targetRole)) {
            throw new BizException("管理员仅可移除普通成员");
        }
        SysUser targetUser = userMapper.selectById(targetUserId);
        SysUser operator = userMapper.selectById(operatorId);
        String name = displayName(targetUser, "用户" + targetUserId);
        String operatorName = displayName(operator, "管理员");
        String kickText = operatorName + "将" + name + "移出群聊";
        Map<String, Object> kickTip = new LinkedHashMap<>();
        kickTip.put("kind", "group_member_kick");
        kickTip.put("actorId", operatorId);
        kickTip.put("actorName", operatorName);
        kickTip.put("targetId", targetUserId);
        kickTip.put("targetName", name);
        kickTip.put("text", kickText);
        // 先发提示再移除，便于群内成员看到
        postGroupSystemTip(operatorId, conversationId, structuredTip(kickTip, kickText));
        try {
            messageHideMapper.hideAllInConversation(targetUserId, conversationId);
        } catch (Exception ignored) {
            // ignore
        }
        memberMapper.delete(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, targetUserId));
        if (targetUser != null) {
            groupMemberEventService.record(c, targetUser, operator, "kick", null, null, "被移出群聊", null);
        }
    }

    @Transactional
    public void dissolveGroup(Long userId, Long conversationId) {
        ImConversation c = requireGroup(conversationId);
        assertOwner(userId, c);
        SysUser operator = userMapper.selectById(userId);
        List<ImConversationMember> members = memberMapper.selectList(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId));
        if (operator != null) {
            groupMemberEventService.record(
                    c, operator, operator, "group_dissolve", "owner", null,
                    "群主解散群聊，解散时成员数：" + members.size(), null);
        }
        for (ImConversationMember m : members) {
            SysUser u = userMapper.selectById(m.getUserId());
            if (u != null) {
                groupMemberEventService.record(c, u, operator, "dissolve", null, null, "群主解散群聊", null);
            }
        }
        groupJoinRequestMapper.delete(new LambdaQueryWrapper<ImGroupJoinRequest>()
                .eq(ImGroupJoinRequest::getConversationId, conversationId));
        messageMapper.delete(new LambdaQueryWrapper<ImMessage>()
                .eq(ImMessage::getConversationId, conversationId));
        memberMapper.delete(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId));
        conversationMapper.deleteById(conversationId);
    }

    @Transactional
    public void leaveGroup(Long userId, Long conversationId) {
        ImConversation c = requireGroup(conversationId);
        Long ownerId = resolveOwnerId(c, conversationId);
        if (ownerId != null && ownerId.equals(userId)) {
            throw new BizException("群主请先转让群主或解散群聊");
        }
        SysUser user = userMapper.selectById(userId);
        String name = user != null && StringUtils.hasText(user.getNickname())
                ? user.getNickname()
                : ("用户" + userId);
        // 先提示再退群，便于其余成员看到
        postGroupSystemTip(userId, conversationId, "「" + name + "」退出了群聊");
        try {
            messageHideMapper.hideAllInConversation(userId, conversationId);
        } catch (Exception ignored) {
            // ignore
        }
        memberMapper.delete(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, userId));
        if (user != null) {
            groupMemberEventService.record(c, user, null, "leave", null, null, "主动退群", null);
        }
    }

    public List<GroupJoinRequestVO> listJoinRequests(Long operatorId, Long conversationId) {
        ImConversation c = requireGroup(conversationId);
        assertOwnerOrAdmin(operatorId, c);
        List<ImGroupJoinRequest> rows = groupJoinRequestMapper.selectList(new LambdaQueryWrapper<ImGroupJoinRequest>()
                .eq(ImGroupJoinRequest::getConversationId, conversationId)
                .eq(ImGroupJoinRequest::getStatus, 0)
                .and(w -> w.isNull(ImGroupJoinRequest::getConfirmBy)
                        .or()
                        .eq(ImGroupJoinRequest::getConfirmBy, "")
                        .or()
                        .eq(ImGroupJoinRequest::getConfirmBy, "admin"))
                .orderByDesc(ImGroupJoinRequest::getId));
        List<GroupJoinRequestVO> list = new ArrayList<>();
        for (ImGroupJoinRequest r : rows) {
            list.add(toJoinRequestVO(r, c));
        }
        return list;
    }

    /** 我收到的、待确认的群邀请 */
    public List<GroupJoinRequestVO> listMyGroupInvites(Long userId) {
        List<ImGroupJoinRequest> rows = groupJoinRequestMapper.selectList(new LambdaQueryWrapper<ImGroupJoinRequest>()
                .eq(ImGroupJoinRequest::getApplicantId, userId)
                .eq(ImGroupJoinRequest::getStatus, 0)
                .eq(ImGroupJoinRequest::getConfirmBy, "invitee")
                .orderByDesc(ImGroupJoinRequest::getId));
        List<GroupJoinRequestVO> list = new ArrayList<>();
        for (ImGroupJoinRequest r : rows) {
            ImConversation c = conversationMapper.selectById(r.getConversationId());
            list.add(toJoinRequestVO(r, c));
        }
        return list;
    }

    /** 用户端群通知中的邀请历史（包含待处理、已同意、已拒绝）。 */
    public List<GroupJoinRequestVO> listMyGroupInviteHistory(Long userId) {
        List<ImGroupJoinRequest> rows = groupJoinRequestMapper.selectList(
                new LambdaQueryWrapper<ImGroupJoinRequest>()
                        .eq(ImGroupJoinRequest::getApplicantId, userId)
                        .isNotNull(ImGroupJoinRequest::getInviterId)
                        .orderByDesc(ImGroupJoinRequest::getId)
                        .last("LIMIT 100"));
        List<GroupJoinRequestVO> list = new ArrayList<>();
        for (ImGroupJoinRequest r : rows) {
            list.add(toJoinRequestVO(r, conversationMapper.selectById(r.getConversationId())));
        }
        return list;
    }

    public int countMyGroupInvites(Long userId) {
        Long cnt = groupJoinRequestMapper.selectCount(new LambdaQueryWrapper<ImGroupJoinRequest>()
                .eq(ImGroupJoinRequest::getApplicantId, userId)
                .eq(ImGroupJoinRequest::getStatus, 0)
                .eq(ImGroupJoinRequest::getConfirmBy, "invitee"));
        return cnt == null ? 0 : cnt.intValue();
    }

    /** 我作为群主/管理员收到的待审核加群申请（群通知聚合展示） */
    public List<GroupJoinRequestVO> listManagedGroupJoinRequests(Long userId) {
        List<Long> groupIds = managedGroupIds(userId);
        if (groupIds.isEmpty()) {
            return List.of();
        }
        List<ImGroupJoinRequest> rows = groupJoinRequestMapper.selectList(
                new LambdaQueryWrapper<ImGroupJoinRequest>()
                        .in(ImGroupJoinRequest::getConversationId, groupIds)
                        .eq(ImGroupJoinRequest::getStatus, 0)
                        .and(w -> w.isNull(ImGroupJoinRequest::getConfirmBy)
                                .or()
                                .eq(ImGroupJoinRequest::getConfirmBy, "")
                                .or()
                                .eq(ImGroupJoinRequest::getConfirmBy, "admin"))
                        .orderByDesc(ImGroupJoinRequest::getId)
                        .last("LIMIT 100"));
        Map<Long, ImConversation> convCache = new HashMap<>();
        List<GroupJoinRequestVO> list = new ArrayList<>();
        for (ImGroupJoinRequest r : rows) {
            ImConversation c = convCache.computeIfAbsent(r.getConversationId(), conversationMapper::selectById);
            list.add(toJoinRequestVO(r, c));
        }
        return list;
    }

    /** 我作为群主/管理员收到的待审核加群申请数 */
    public int countManagedPendingJoinRequests(Long userId) {
        List<Long> groupIds = managedGroupIds(userId);
        if (groupIds.isEmpty()) {
            return 0;
        }
        Long cnt = groupJoinRequestMapper.selectCount(
                new LambdaQueryWrapper<ImGroupJoinRequest>()
                        .in(ImGroupJoinRequest::getConversationId, groupIds)
                        .eq(ImGroupJoinRequest::getStatus, 0)
                        .and(w -> w.isNull(ImGroupJoinRequest::getConfirmBy)
                                .or()
                                .eq(ImGroupJoinRequest::getConfirmBy, "")
                                .or()
                                .eq(ImGroupJoinRequest::getConfirmBy, "admin")));
        return cnt == null ? 0 : cnt.intValue();
    }

    /** 我拥有管理权的群 ID（群主 / 管理员） */
    private List<Long> managedGroupIds(Long userId) {
        List<ImConversationMember> rows = memberMapper.selectList(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getUserId, userId)
                .in(ImConversationMember::getRole, List.of("owner", "admin")));
        if (rows.isEmpty()) {
            return List.of();
        }
        List<Long> ids = new ArrayList<>();
        for (ImConversationMember row : rows) {
            if (row.getConversationId() != null && !ids.contains(row.getConversationId())) {
                ids.add(row.getConversationId());
            }
        }
        if (ids.isEmpty()) {
            return List.of();
        }
        return conversationMapper.selectList(new LambdaQueryWrapper<ImConversation>()
                        .in(ImConversation::getId, ids)
                        .eq(ImConversation::getType, 2))
                .stream()
                .map(ImConversation::getId)
                .filter(id -> id != null)
                .toList();
    }

    @Transactional
    public void acceptGroupInvite(Long userId, Long requestId) {
        ImGroupJoinRequest req = requirePendingInviteeRequest(userId, requestId);
        ImConversation c = requireGroup(req.getConversationId());
        SysUser applicant = userMapper.selectById(userId);
        if (applicant == null) {
            throw new BizException("用户不存在");
        }
        Long exists = memberMapper.selectCount(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, c.getId())
                .eq(ImConversationMember::getUserId, userId));
        if (exists != null && exists > 0) {
            req.setStatus(1);
            req.setHandledBy(userId);
            req.setHandledAt(OffsetDateTime.now());
            req.setHandleRemark("已在群中");
            groupJoinRequestMapper.updateById(req);
            return;
        }
        boolean inviterIsManager = req.getInviterId() != null && isOwnerOrAdmin(req.getInviterId(), c);
        boolean needAdmin = Boolean.TRUE.equals(c.getJoinVerifyRequired()) && !inviterIsManager;
        if (needAdmin) {
            req.setConfirmBy("admin");
            req.setSource("invite");
            req.setMessage(StringUtils.hasText(req.getMessage()) ? req.getMessage() : "对方已同意邀请，待管理员审核");
            groupJoinRequestMapper.updateById(req);
            groupMemberEventService.record(
                    c, applicant, userMapper.selectById(req.getInviterId()),
                    "apply", "invite", req.getMessage(), "对方已同意，等待管理员审核", req.getId());
            return;
        }
        SysUser inviter = req.getInviterId() == null ? null : userMapper.selectById(req.getInviterId());
        doAddMemberAndTip(c, applicant, "invite", inviter, req.getMessage(), req.getId(), "同意群邀请");
        req.setStatus(1);
        req.setHandledBy(userId);
        req.setHandledAt(OffsetDateTime.now());
        req.setHandleRemark("同意");
        groupJoinRequestMapper.updateById(req);
    }

    @Transactional
    public void rejectGroupInvite(Long userId, Long requestId) {
        ImGroupJoinRequest req = requirePendingInviteeRequest(userId, requestId);
        ImConversation c = conversationMapper.selectById(req.getConversationId());
        SysUser applicant = userMapper.selectById(userId);
        req.setStatus(2);
        req.setHandledBy(userId);
        req.setHandledAt(OffsetDateTime.now());
        req.setHandleRemark("拒绝");
        groupJoinRequestMapper.updateById(req);
        if (c != null && applicant != null) {
            groupMemberEventService.record(
                    c, applicant, userMapper.selectById(req.getInviterId()),
                    "reject", req.getSource(), req.getMessage(), "拒绝群邀请", req.getId());
        }
    }

    @Transactional
    public void approveJoinRequest(Long operatorId, Long conversationId, Long requestId) {
        ImConversation c = requireGroup(conversationId);
        assertOwnerOrAdmin(operatorId, c);
        ImGroupJoinRequest req = requirePendingAdminRequest(conversationId, requestId);
        SysUser applicant = userMapper.selectById(req.getApplicantId());
        if (applicant == null) {
            throw new BizException("申请用户不存在");
        }
        SysUser operator = userMapper.selectById(operatorId);
        Long exists = memberMapper.selectCount(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, req.getApplicantId()));
        if (exists == null || exists == 0) {
            String joinSource = normalizeJoinSource(req.getSource(), "join");
            SysUser joinActor = "invite".equals(joinSource) && req.getInviterId() != null
                    ? userMapper.selectById(req.getInviterId()) : null;
            doAddMemberAndTip(c, applicant, joinSource, joinActor, req.getMessage(), req.getId(), "审核通过");
        }
        req.setStatus(1);
        req.setHandledBy(operatorId);
        req.setHandledAt(OffsetDateTime.now());
        req.setHandleRemark("同意");
        groupJoinRequestMapper.updateById(req);
        groupMemberEventService.record(c, applicant, operator, "approve", req.getSource(), req.getMessage(), "审核通过", req.getId());
    }

    @Transactional
    public void rejectJoinRequest(Long operatorId, Long conversationId, Long requestId, String remark) {
        ImConversation c = requireGroup(conversationId);
        assertOwnerOrAdmin(operatorId, c);
        ImGroupJoinRequest req = requirePendingAdminRequest(conversationId, requestId);
        SysUser applicant = userMapper.selectById(req.getApplicantId());
        SysUser operator = userMapper.selectById(operatorId);
        req.setStatus(2);
        req.setHandledBy(operatorId);
        req.setHandledAt(OffsetDateTime.now());
        req.setHandleRemark(StringUtils.hasText(remark) ? remark.trim() : "拒绝");
        groupJoinRequestMapper.updateById(req);
        if (applicant != null) {
            groupMemberEventService.record(
                    c, applicant, operator, "reject", req.getSource(), req.getMessage(),
                    StringUtils.hasText(remark) ? remark.trim() : "审核拒绝", req.getId()
            );
        }
    }

    @Transactional
    public void transferOwner(Long operatorId, Long conversationId, Long newOwnerId) {
        ImConversation c = requireGroup(conversationId);
        assertOwner(operatorId, c);
        if (newOwnerId == null || newOwnerId.equals(operatorId)) {
            throw new BizException("请选择新的群主");
        }
        ImConversationMember next = memberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, newOwnerId)
                .last("LIMIT 1"));
        if (next == null) {
            throw new BizException("对方不在群中");
        }
        ImConversationMember old = requireMember(operatorId, conversationId);
        old.setRole("member");
        memberMapper.updateById(old);
        next.setRole("owner");
        memberMapper.updateById(next);
        c.setOwnerId(newOwnerId);
        c.setUpdatedAt(OffsetDateTime.now());
        conversationMapper.updateById(c);

        SysUser fromUser = userMapper.selectById(operatorId);
        SysUser toUser = userMapper.selectById(newOwnerId);
        groupOwnerTransferService.record(
                c, fromUser, toUser,
                operatorId,
                fromUser == null ? null : fromUser.getNickname(),
                "user",
                "user_transfer"
        );
        if (toUser != null) {
            groupMemberEventService.record(
                    c, toUser, fromUser, "role_owner", "owner_transfer", null,
                    "已成为新群主", null);
        }
        String name = toUser != null && StringUtils.hasText(toUser.getNickname())
                ? toUser.getNickname()
                : ("用户" + newOwnerId);
        postGroupSystemTip(operatorId, conversationId, "「" + name + "」已成为新群主");
    }

    private String userDisplayName(Long userId) {
        if (userId == null) {
            return "用户";
        }
        SysUser u = userMapper.selectById(userId);
        if (u != null && StringUtils.hasText(u.getNickname())) {
            return u.getNickname();
        }
        return "用户" + userId;
    }

    private ImConversation requireGroup(Long conversationId) {
        ImConversation c = conversationMapper.selectById(conversationId);
        if (c == null || c.getType() == null || c.getType() != 2) {
            throw new BizException("群聊不存在");
        }
        return c;
    }

    /** 解析并回填群主：优先 owner_id，否则取最早入群成员 */
    private Long resolveOwnerId(ImConversation c, Long conversationId) {
        if (c.getOwnerId() != null) {
            syncOwnerRole(conversationId, c.getOwnerId());
            return c.getOwnerId();
        }
        List<ImConversationMember> ordered = memberMapper.selectList(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .orderByAsc(ImConversationMember::getJoinedAt)
                .orderByAsc(ImConversationMember::getId)
                .last("LIMIT 1"));
        if (ordered.isEmpty()) {
            return null;
        }
        Long ownerId = ordered.get(0).getUserId();
        c.setOwnerId(ownerId);
        if (!StringUtils.hasText(c.getNotice())) {
            c.setNotice("欢迎加入本群。请文明交流，遵守群规。");
        }
        c.setUpdatedAt(OffsetDateTime.now());
        conversationMapper.updateById(c);
        syncOwnerRole(conversationId, ownerId);
        return ownerId;
    }

    private void syncOwnerRole(Long conversationId, Long ownerId) {
        if (ownerId == null) return;
        ImConversationMember owner = memberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, ownerId)
                .last("LIMIT 1"));
        if (owner != null && !"owner".equals(owner.getRole())) {
            owner.setRole("owner");
            memberMapper.updateById(owner);
        }
    }

    private String resolveMemberRole(ImConversationMember m, Long ownerId) {
        if (m == null) return "member";
        if (ownerId != null && ownerId.equals(m.getUserId())) {
            return "owner";
        }
        if ("admin".equalsIgnoreCase(m.getRole())) {
            return "admin";
        }
        if ("owner".equalsIgnoreCase(m.getRole()) && (ownerId == null || !ownerId.equals(m.getUserId()))) {
            return "member";
        }
        return "member";
    }

    private int roleRank(String role) {
        if ("owner".equals(role)) return 2;
        if ("admin".equals(role)) return 1;
        return 0;
    }

    private void assertOwner(Long userId, ImConversation c) {
        Long ownerId = resolveOwnerId(c, c.getId());
        if (ownerId == null) {
            throw new BizException("群主信息缺失");
        }
        if (!ownerId.equals(userId)) {
            throw new BizException("仅群主可操作");
        }
    }

    private void assertOwnerOrAdmin(Long userId, ImConversation c) {
        Long ownerId = resolveOwnerId(c, c.getId());
        if (ownerId != null && ownerId.equals(userId)) {
            return;
        }
        ImConversationMember m = requireMember(userId, c.getId());
        if (!"admin".equalsIgnoreCase(m.getRole())) {
            throw new BizException("仅群主或管理员可操作");
        }
    }

    private void assertGroupMember(Long userId, Long conversationId) {
        Long joined = memberMapper.selectCount(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, userId));
        if (joined == null || joined == 0) {
            throw new BizException("你不在该群聊中");
        }
    }

    private void ensurePrivateConversationsForFriends(Long userId) {
        List<ImFriend> friends = friendMapper.selectList(new LambdaQueryWrapper<ImFriend>()
                .eq(ImFriend::getUserId, userId));
        if (friends == null || friends.isEmpty()) {
            return;
        }
        for (ImFriend f : friends) {
            if (f.getFriendId() == null || f.getFriendId().equals(userId)) {
                continue;
            }
            Long shared = memberMapper.findSharedPrivateConversationId(userId, f.getFriendId());
            if (shared != null) {
                continue;
            }
            try {
                getOrCreatePrivate(userId, f.getFriendId());
            } catch (Exception ignored) {
                // skip broken friend
            }
        }
    }

    /** 同一私聊对象只保留一个会话（保留 id 更小/更早的） */
    private List<ConversationVO> dedupePrivateConversations(Long userId, List<ConversationVO> list) {
        if (list == null || list.isEmpty()) {
            return list;
        }
        Map<Long, ConversationVO> byPeer = new LinkedHashMap<>();
        List<ConversationVO> others = new ArrayList<>();
        for (ConversationVO vo : list) {
            if (vo.getType() != null && vo.getType() == 1 && vo.getPeerUserId() != null) {
                ConversationVO prev = byPeer.get(vo.getPeerUserId());
                if (prev == null) {
                    byPeer.put(vo.getPeerUserId(), vo);
                    continue;
                }
                ConversationVO keep;
                ConversationVO drop;
                if (vo.getId() != null && (prev.getId() == null || vo.getId() < prev.getId())) {
                    keep = vo;
                    drop = prev;
                } else {
                    keep = prev;
                    drop = vo;
                }
                byPeer.put(vo.getPeerUserId(), keep);
                hideMemberConversation(drop.getId(), userId);
                if (keep.getPeerUserId() != null) {
                    hidePrivateDuplicates(userId, keep.getPeerUserId(), keep.getId());
                }
            } else {
                others.add(vo);
            }
        }
        List<ConversationVO> out = new ArrayList<>(byPeer.values());
        out.addAll(others);
        out.sort((a, b) -> {
            boolean ap = Boolean.TRUE.equals(a.getPinned());
            boolean bp = Boolean.TRUE.equals(b.getPinned());
            if (ap != bp) {
                return ap ? -1 : 1;
            }
            OffsetDateTime at = a.getLastMsgTime();
            OffsetDateTime bt = b.getLastMsgTime();
            if (at == null && bt == null) return 0;
            if (at == null) return 1;
            if (bt == null) return -1;
            return bt.compareTo(at);
        });
        return out;
    }

    private void ensurePrivateMemberRow(Long conversationId, Long userId, Long peerUserId) {
        ImConversationMember row = memberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, userId)
                .last("LIMIT 1"));
        if (row == null) {
            ImConversationMember restored = new ImConversationMember();
            restored.setConversationId(conversationId);
            restored.setUserId(userId);
            restored.setPeerUserId(peerUserId);
            restored.setUnreadCount(0);
            restored.setMute(false);
            restored.setArchived(false);
            restored.setPinned(false);
            restored.setHidden(false);
            restored.setRole("member");
            restored.setJoinedAt(OffsetDateTime.now());
            memberMapper.insert(restored);
            return;
        }
        boolean changed = false;
        if (Boolean.TRUE.equals(row.getHidden())) {
            row.setHidden(false);
            changed = true;
        }
        if (row.getPeerUserId() == null || !peerUserId.equals(row.getPeerUserId())) {
            row.setPeerUserId(peerUserId);
            changed = true;
        }
        if (changed) {
            memberMapper.updateById(row);
        }
    }

    private void hidePrivateDuplicates(Long userId, Long peerUserId, Long keepConversationId) {
        List<ImConversationMember> rows = memberMapper.selectList(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getUserId, userId)
                .eq(ImConversationMember::getPeerUserId, peerUserId));
        if (rows == null) {
            return;
        }
        for (ImConversationMember row : rows) {
            if (row.getConversationId() == null || row.getConversationId().equals(keepConversationId)) {
                continue;
            }
            if (!Boolean.TRUE.equals(row.getHidden())) {
                row.setHidden(true);
                memberMapper.updateById(row);
            }
        }
    }

    private void hideMemberConversation(Long conversationId, Long userId) {
        if (conversationId == null) {
            return;
        }
        LambdaQueryWrapper<ImConversationMember> qw = new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId);
        if (userId != null) {
            qw.eq(ImConversationMember::getUserId, userId);
        }
        List<ImConversationMember> rows = memberMapper.selectList(qw);
        for (ImConversationMember row : rows) {
            if (!Boolean.TRUE.equals(row.getHidden())) {
                row.setHidden(true);
                memberMapper.updateById(row);
            }
        }
    }

    private ConversationVO buildSimpleVo(Long userId, Long convId, SysUser peer) {
        ConversationVO vo = new ConversationVO();
        vo.setId(convId);
        vo.setType(1);
        ImFriend rel = findFriendRel(userId, peer != null ? peer.getId() : null);
        vo.setTitle(resolvePeerDisplayName(userId, peer));
        vo.setAvatarUrl(peer.getAvatarUrl());
        vo.setPeerUserId(peer.getId());
        vo.setPeerNickname(peer.getNickname());
        vo.setFileTransferAssistant(Boolean.TRUE.equals(peer.getFileTransferAssistant()));
        vo.setUnreadCount(0);
        vo.setOnline(false);
        if (rel != null && StringUtils.hasText(rel.getTag())) {
            vo.setTag(rel.getTag().trim());
        }
        return vo;
    }

    private ImFriend findFriendRel(Long userId, Long friendId) {
        if (userId == null || friendId == null) {
            return null;
        }
        return friendMapper.selectOne(new LambdaQueryWrapper<ImFriend>()
                .eq(ImFriend::getUserId, userId)
                .eq(ImFriend::getFriendId, friendId)
                .last("LIMIT 1"));
    }

    /** 单聊标题：优先好友备注（含后台默认好友新昵称），否则昵称 */
    private String resolvePeerDisplayName(SysUser peer, ImFriend rel) {
        if (peer == null) {
            return "用户";
        }
        if (rel != null && StringUtils.hasText(rel.getRemark())) {
            return rel.getRemark().trim();
        }
        return StringUtils.hasText(peer.getNickname()) ? peer.getNickname() : "用户";
    }

    private String resolvePeerDisplayName(Long userId, SysUser peer) {
        return displayNameService.displayName(userId, peer, peer != null ? peer.getId() : null);
    }

    private boolean matchFilter(ConversationVO vo, String filter) {
        return switch (filter) {
            case "unread", "未读" -> vo.getUnreadCount() != null && vo.getUnreadCount() > 0;
            case "personal", "个人" -> vo.getType() != null && vo.getType() == 1;
            case "group", "群组" -> vo.getType() != null && vo.getType() == 2;
            default -> true;
        };
    }

    private boolean isBlockedByMe(Long userId, Long peerId) {
        Long cnt = userBlockMapper.selectCount(new LambdaQueryWrapper<ImUserBlock>()
                .eq(ImUserBlock::getUserId, userId)
                .eq(ImUserBlock::getBlockedUserId, peerId));
        return cnt != null && cnt > 0;
    }

    private boolean isBlockedEitherWay(Long userA, Long userB) {
        return isBlockedByMe(userA, userB) || isBlockedByMe(userB, userA);
    }

    private String normalizeJoinSource(String source, String fallback) {
        if (!StringUtils.hasText(source)) {
            return fallback;
        }
        String s = source.trim().toLowerCase(java.util.Locale.ROOT);
        return switch (s) {
            case "create", "create_invite", "invite", "qrcode", "card", "join", "unknown" -> s;
            case "scan", "qr" -> "qrcode";
            case "名片", "contact_card" -> "card";
            default -> fallback;
        };
    }

    private int countPendingJoinRequests(Long conversationId) {
        Long cnt = groupJoinRequestMapper.selectCount(new LambdaQueryWrapper<ImGroupJoinRequest>()
                .eq(ImGroupJoinRequest::getConversationId, conversationId)
                .eq(ImGroupJoinRequest::getStatus, 0)
                .and(w -> w.isNull(ImGroupJoinRequest::getConfirmBy)
                        .or()
                        .eq(ImGroupJoinRequest::getConfirmBy, "")
                        .or()
                        .eq(ImGroupJoinRequest::getConfirmBy, "admin")));
        return cnt == null ? 0 : cnt.intValue();
    }

    private boolean hasPendingJoinRequest(Long conversationId, Long userId) {
        Long cnt = groupJoinRequestMapper.selectCount(new LambdaQueryWrapper<ImGroupJoinRequest>()
                .eq(ImGroupJoinRequest::getConversationId, conversationId)
                .eq(ImGroupJoinRequest::getApplicantId, userId)
                .eq(ImGroupJoinRequest::getStatus, 0));
        return cnt != null && cnt > 0;
    }

    private ImGroupJoinRequest createOrRefreshJoinRequest(
            Long conversationId,
            Long applicantId,
            Long inviterId,
            String message,
            String source,
            String confirmBy
    ) {
        String phase = "invitee".equals(confirmBy) ? "invitee" : "admin";
        ImGroupJoinRequest existing = groupJoinRequestMapper.selectOne(new LambdaQueryWrapper<ImGroupJoinRequest>()
                .eq(ImGroupJoinRequest::getConversationId, conversationId)
                .eq(ImGroupJoinRequest::getApplicantId, applicantId)
                .eq(ImGroupJoinRequest::getStatus, 0)
                .last("LIMIT 1"));
        if (existing != null) {
            if (StringUtils.hasText(message)) {
                existing.setMessage(message.trim());
            }
            if (inviterId != null) {
                existing.setInviterId(inviterId);
            }
            existing.setSource(source);
            existing.setConfirmBy(phase);
            groupJoinRequestMapper.updateById(existing);
            return existing;
        }
        ImGroupJoinRequest req = new ImGroupJoinRequest();
        req.setConversationId(conversationId);
        req.setApplicantId(applicantId);
        req.setInviterId(inviterId);
        req.setMessage(StringUtils.hasText(message) ? message.trim() : null);
        req.setSource(source);
        req.setConfirmBy(phase);
        req.setStatus(0);
        req.setCreatedAt(OffsetDateTime.now());
        groupJoinRequestMapper.insert(req);
        return req;
    }

    private ImGroupJoinRequest requirePendingAdminRequest(Long conversationId, Long requestId) {
        ImGroupJoinRequest req = groupJoinRequestMapper.selectById(requestId);
        if (req == null || !conversationId.equals(req.getConversationId())) {
            throw new BizException("申请不存在");
        }
        if (req.getStatus() == null || req.getStatus() != 0) {
            throw new BizException("申请已处理");
        }
        if ("invitee".equals(req.getConfirmBy())) {
            throw new BizException("对方尚未确认邀请");
        }
        return req;
    }

    private ImGroupJoinRequest requirePendingInviteeRequest(Long userId, Long requestId) {
        ImGroupJoinRequest req = groupJoinRequestMapper.selectById(requestId);
        if (req == null || !userId.equals(req.getApplicantId())) {
            throw new BizException("邀请不存在");
        }
        if (req.getStatus() == null || req.getStatus() != 0) {
            throw new BizException("邀请已处理");
        }
        if (!"invitee".equals(req.getConfirmBy())) {
            throw new BizException("无需确认该邀请");
        }
        return req;
    }

    private boolean isOwnerOrAdmin(Long userId, ImConversation c) {
        try {
            assertOwnerOrAdmin(userId, c);
            return true;
        } catch (BizException e) {
            return false;
        }
    }

    private ConversationVO doAddMemberAndTip(
            ImConversation c,
            SysUser user,
            String source,
            SysUser operator,
            String message,
            Long requestId,
            String reason
    ) {
        ImConversationMember m = new ImConversationMember();
        m.setConversationId(c.getId());
        m.setUserId(user.getId());
        m.setUnreadCount(0);
        m.setMute(false);
        m.setArchived(false);
        m.setPinned(false);
        m.setHidden(false);
        m.setSpeakMuted(false);
        m.setRole("member");
        m.setJoinSource(source);
        m.setJoinedAt(OffsetDateTime.now());
        memberMapper.insert(m);

        String targetName = displayName(user, "新成员");
        String actorName = operator == null ? null : displayName(operator, "群成员");
        String preview = operator != null && "invite".equals(source)
                ? actorName + "邀请" + targetName + "加入群聊"
                : targetName + joinSourceText(source);
        c.setLastMsgPreview(preview);
        c.setLastMsgTime(OffsetDateTime.now());
        c.setUpdatedAt(OffsetDateTime.now());
        conversationMapper.updateById(c);

        try {
            Long tipFrom = operator != null ? operator.getId() : user.getId();
            Map<String, Object> tip = new LinkedHashMap<>();
            tip.put("kind", "group_member_join");
            tip.put("actorId", operator == null ? null : operator.getId());
            tip.put("actorName", actorName);
            tip.put("targetId", user.getId());
            tip.put("targetName", targetName);
            tip.put("source", source);
            tip.put("text", preview);
            postGroupSystemTip(tipFrom, c.getId(),
                    new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(tip));
        } catch (Exception ignored) {
            // ignore tip failure
        }
        groupMemberEventService.record(c, user, operator, "join", source, message, reason, requestId);
        eventPublisher.publishEvent(new GroupMemberJoinedEvent(c.getId(), user.getId(), m.getId()));
        return toConversationVOForUser(user.getId(), c, m);
    }

    private String displayName(SysUser user, String fallback) {
        return user != null && StringUtils.hasText(user.getNickname()) ? user.getNickname() : fallback;
    }

    private String joinSourceText(String source) {
        return switch (source == null ? "" : source) {
            case "qrcode" -> "通过扫描二维码加入群聊";
            case "card" -> "通过群名片加入群聊";
            case "create", "create_invite" -> "加入群聊";
            default -> "加入群聊";
        };
    }

    private String structuredTip(Map<String, Object> payload, String fallback) {
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(payload);
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private GroupJoinRequestVO toJoinRequestVO(ImGroupJoinRequest r, ImConversation c) {
        SysUser applicant = userMapper.selectById(r.getApplicantId());
        SysUser inviter = r.getInviterId() == null ? null : userMapper.selectById(r.getInviterId());
        SysUser handler = r.getHandledBy() == null ? null : userMapper.selectById(r.getHandledBy());
        return GroupJoinRequestVO.builder()
                .id(r.getId())
                .conversationId(r.getConversationId())
                .groupTitle(c == null ? null : c.getTitle())
                .applicantId(r.getApplicantId())
                .applicantNickname(applicant == null ? null : applicant.getNickname())
                .applicantAvatarUrl(applicant == null ? null : applicant.getAvatarUrl())
                .applicantPhone(applicant == null ? null : applicant.getPhone())
                .inviterId(r.getInviterId())
                .inviterNickname(inviter == null ? null : inviter.getNickname())
                .message(r.getMessage())
                .source(r.getSource())
                .status(r.getStatus())
                .handledBy(r.getHandledBy())
                .handlerNickname(handler == null ? null : handler.getNickname())
                .handleRemark(r.getHandleRemark())
                .createdAt(r.getCreatedAt())
                .handledAt(r.getHandledAt())
                .build();
    }
}
