package com.pulse.api.controller;

import com.pulse.api.security.AuthContext;
import com.pulse.api.service.ConversationService;
import com.pulse.api.service.BurnAfterReadService;
import com.pulse.api.service.AutoDeleteMessageService;
import com.pulse.api.service.GroupAutomationService;
import com.pulse.api.service.LiveLocationService;
import com.pulse.api.vo.ConversationReadStateVO;
import com.pulse.api.vo.ConversationVO;
import com.pulse.api.vo.GroupDetailVO;
import com.pulse.api.vo.GroupJoinRequestVO;
import com.pulse.api.vo.GroupJoinResultVO;
import com.pulse.api.vo.GroupScheduledMessageVO;
import com.pulse.api.vo.GroupWelcomeVO;
import com.pulse.api.vo.GroupPreviewVO;
import com.pulse.api.vo.ImportantNotificationSettingVO;
import com.pulse.common.result.R;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

@RestController
@RequestMapping("/api/v1/conversations")
@RequiredArgsConstructor
public class ConversationController {
    private final ConversationService conversationService;
    private final BurnAfterReadService burnAfterReadService;
    private final GroupAutomationService groupAutomationService;
    private final AutoDeleteMessageService autoDeleteMessageService;
    private final LiveLocationService liveLocationService;

    @GetMapping("/{id}/live-location")
    public R<Map<String, Object>> liveLocation(@PathVariable("id") Long id) {
        return R.ok(liveLocationService.state(AuthContext.currentUserId(), id));
    }

    @PutMapping("/{id}/live-location")
    public R<Map<String, Object>> updateLiveLocation(@PathVariable("id") Long id,
                                                     @RequestBody Map<String, Object> body) {
        double latitude = Double.parseDouble(String.valueOf(body.get("latitude")));
        double longitude = Double.parseDouble(String.valueOf(body.get("longitude")));
        Double accuracy = body.get("accuracy") == null ? null : Double.valueOf(String.valueOf(body.get("accuracy")));
        Double heading = body.get("heading") == null ? null : Double.valueOf(String.valueOf(body.get("heading")));
        boolean start = Boolean.parseBoolean(String.valueOf(body.getOrDefault("start", false)));
        return R.ok(liveLocationService.update(AuthContext.currentUserId(), id, latitude, longitude, accuracy, heading, start));
    }

    @DeleteMapping("/{id}/live-location")
    public R<Void> leaveLiveLocation(@PathVariable("id") Long id) {
        liveLocationService.leave(AuthContext.currentUserId(), id);
        return R.ok();
    }

    @DeleteMapping("/{id}/live-location/session")
    public R<Void> endLiveLocation(@PathVariable("id") Long id) {
        liveLocationService.end(AuthContext.currentUserId(), id);
        return R.ok();
    }

    @GetMapping
    public R<List<ConversationVO>> list(@RequestParam(required = false, defaultValue = "all") String filter) {
        return R.ok(conversationService.listMine(AuthContext.currentUserId(), filter));
    }

    @PostMapping("/private")
    public R<ConversationVO> openPrivate(@RequestBody Map<String, Object> body) {
        Long peerUserId = Long.valueOf(String.valueOf(body.get("peerUserId")));
        return R.ok(conversationService.getOrCreatePrivate(AuthContext.currentUserId(), peerUserId));
    }

    @PostMapping("/{id}/read")
    public R<Map<String, Object>> markRead(
            @PathVariable("id") Long id,
            @RequestBody(required = false) Map<String, Object> body
    ) {
        String lastReadMsgId = null;
        if (body != null && body.get("lastReadMsgId") != null) {
            lastReadMsgId = String.valueOf(body.get("lastReadMsgId")).trim();
            if (lastReadMsgId.isEmpty() || "null".equalsIgnoreCase(lastReadMsgId)) {
                lastReadMsgId = null;
            }
        }
        return R.ok(conversationService.markRead(AuthContext.currentUserId(), id, lastReadMsgId));
    }

    @PostMapping("/{id}/messages/{msgId}/burn-view")
    public R<Map<String, Object>> viewBurnMedia(
            @PathVariable("id") Long id,
            @PathVariable String msgId
    ) {
        return R.ok(burnAfterReadService.viewMedia(AuthContext.currentUserId(), id, msgId));
    }

    /** 会话已读水位：单聊对方 / 群成员 */
    @GetMapping("/{id}/read-states")
    public R<ConversationReadStateVO> readStates(@PathVariable("id") Long id) {
        return R.ok(conversationService.getReadStates(AuthContext.currentUserId(), id));
    }

    @PostMapping("/group")
    public R<ConversationVO> createGroup(@RequestBody Map<String, Object> body) {
        String title = body.get("title") == null ? "" : String.valueOf(body.get("title"));
        List<Long> memberIds = new java.util.ArrayList<>();
        Object raw = body.get("memberIds");
        if (raw instanceof List<?> list) {
            for (Object o : list) {
                if (o != null) {
                    memberIds.add(Long.valueOf(String.valueOf(o)));
                }
            }
        }
        return R.ok(conversationService.createGroup(AuthContext.currentUserId(), title, memberIds));
    }

    /** 搜索允许被发现的群聊（群号精确匹配，群名称按群主设置匹配）。 */
    @GetMapping("/group/search")
    public R<List<GroupPreviewVO>> searchGroups(@RequestParam("q") String keyword) {
        return R.ok(conversationService.searchPublicGroups(AuthContext.currentUserId(), keyword));
    }

    @GetMapping("/{id}/group")
    public R<GroupDetailVO> groupDetail(@PathVariable("id") Long id) {
        return R.ok(conversationService.getGroupDetail(AuthContext.currentUserId(), id));
    }

    @GetMapping("/{id}/group/welcome")
    public R<GroupWelcomeVO> groupWelcome(@PathVariable("id") Long id) {
        return R.ok(groupAutomationService.getWelcome(AuthContext.currentUserId(), id));
    }

    @PutMapping("/{id}/group/welcome")
    public R<Void> updateGroupWelcome(@PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        String message = body == null || body.get("message") == null ? "" : String.valueOf(body.get("message"));
        groupAutomationService.saveWelcome(AuthContext.currentUserId(), id, message);
        return R.ok();
    }

    @GetMapping("/{id}/group/scheduled-messages")
    public R<List<GroupScheduledMessageVO>> listScheduledMessages(@PathVariable("id") Long id) {
        return R.ok(groupAutomationService.listScheduledMessages(AuthContext.currentUserId(), id));
    }

    @PostMapping("/{id}/group/scheduled-messages")
    public R<GroupScheduledMessageVO> createScheduledMessage(
            @PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        return R.ok(groupAutomationService.createScheduledMessage(
                AuthContext.currentUserId(), id, parseInt(body, "msgType", 0),
                body == null || body.get("content") == null ? "" : String.valueOf(body.get("content")),
                parseSendAt(body == null ? null : body.get("sendAt"))));
    }

    @PutMapping("/{id}/group/scheduled-messages/{scheduleId}")
    public R<GroupScheduledMessageVO> updateScheduledMessage(
            @PathVariable("id") Long id,
            @PathVariable("scheduleId") Long scheduleId,
            @RequestBody Map<String, Object> body) {
        return R.ok(groupAutomationService.updateScheduledMessage(
                AuthContext.currentUserId(), id, scheduleId, parseInt(body, "msgType", 0),
                body == null || body.get("content") == null ? "" : String.valueOf(body.get("content")),
                parseSendAt(body == null ? null : body.get("sendAt"))));
    }

    @DeleteMapping("/{id}/group/scheduled-messages/{scheduleId}")
    public R<Void> cancelScheduledMessage(@PathVariable("id") Long id, @PathVariable("scheduleId") Long scheduleId) {
        groupAutomationService.cancelScheduledMessage(AuthContext.currentUserId(), id, scheduleId);
        return R.ok();
    }

    private int parseInt(Map<String, Object> body, String key, int fallback) {
        try {
            return body == null || body.get(key) == null ? fallback : Integer.parseInt(String.valueOf(body.get(key)));
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private OffsetDateTime parseSendAt(Object raw) {
        if (raw == null) return null;
        if (raw instanceof Number n) return Instant.ofEpochMilli(n.longValue()).atOffset(ZoneOffset.UTC);
        String text = String.valueOf(raw).trim();
        if (!org.springframework.util.StringUtils.hasText(text)) return null;
        try {
            return OffsetDateTime.parse(text);
        } catch (Exception ignored) {
            try {
                return LocalDateTime.parse(text).atOffset(ZoneOffset.ofHours(8));
            } catch (Exception e) {
                return null;
            }
        }
    }

    /** 群简介（非成员可读） */
    @GetMapping("/{id}/group/preview")
    public R<GroupPreviewVO> groupPreview(@PathVariable("id") Long id) {
        return R.ok(conversationService.getGroupPreview(AuthContext.currentUserId(), id));
    }

    @GetMapping("/{id}/group/important-notifications")
    public R<ImportantNotificationSettingVO> importantNotifications(@PathVariable("id") Long id) {
        return R.ok(conversationService.getImportantNotificationSetting(AuthContext.currentUserId(), id));
    }

    @PutMapping("/{id}/group/important-notifications")
    public R<Void> updateImportantNotifications(
            @PathVariable("id") Long id,
            @RequestBody Map<String, Object> body
    ) {
        Boolean atAll = body.containsKey("atAll") ? Boolean.valueOf(String.valueOf(body.get("atAll"))) : null;
        Boolean mentionMe = body.containsKey("mentionMe") ? Boolean.valueOf(String.valueOf(body.get("mentionMe"))) : null;
        Boolean replyMe = body.containsKey("replyMe") ? Boolean.valueOf(String.valueOf(body.get("replyMe"))) : null;
        Boolean announcement = body.containsKey("announcement") ? Boolean.valueOf(String.valueOf(body.get("announcement"))) : null;
        List<Long> followed = null;
        Object rawFollowed = body.get("followedMemberIds");
        if (rawFollowed instanceof List<?> list) {
            followed = new java.util.ArrayList<>();
            for (Object value : list) {
                if (value == null) continue;
                try { followed.add(Long.valueOf(String.valueOf(value))); }
                catch (Exception ignored) { }
            }
        }
        conversationService.updateImportantNotificationSetting(
                AuthContext.currentUserId(), id, atAll, mentionMe, replyMe, announcement, followed);
        return R.ok();
    }

    /** 主动加入群聊（名片 / 扫码），开启审核时返回 pending */
    @PostMapping("/{id}/group/join")
    public R<GroupJoinResultVO> joinGroup(
            @PathVariable("id") Long id,
            @RequestBody(required = false) Map<String, Object> body
    ) {
        String source = null;
        String message = null;
        if (body != null) {
            if (body.get("source") != null) {
                source = String.valueOf(body.get("source"));
            }
            if (body.get("message") != null) {
                message = String.valueOf(body.get("message"));
            }
        }
        return R.ok(conversationService.joinGroup(AuthContext.currentUserId(), id, source, message));
    }

    /** 加群审核开关 */
    @PostMapping("/{id}/group/join-verify")
    public R<Void> setJoinVerify(@PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        boolean required = Boolean.parseBoolean(String.valueOf(body.get("joinVerifyRequired")));
        conversationService.setJoinVerifyRequired(AuthContext.currentUserId(), id, required);
        return R.ok();
    }

    @GetMapping("/{id}/burn-after-read")
    public R<Map<String, Object>> burnAfterReadSetting(@PathVariable("id") Long id) {
        return R.ok(burnAfterReadService.getSetting(AuthContext.currentUserId(), id));
    }

    @PutMapping("/{id}/burn-after-read")
    public R<Map<String, Object>> updateBurnAfterRead(
            @PathVariable("id") Long id,
            @RequestBody Map<String, Object> body
    ) {
        boolean enabled = Boolean.parseBoolean(String.valueOf(body.getOrDefault("enabled", false)));
        int seconds;
        try {
            seconds = Integer.parseInt(String.valueOf(body.getOrDefault("burnSeconds", 10)));
        } catch (Exception e) {
            seconds = -1;
        }
        Long userId = AuthContext.currentUserId();
        Map<String, Object> result = burnAfterReadService.updateSetting(userId, id, enabled, seconds);
        conversationService.postBurnSystemTip(userId, id, enabled, seconds);
        return R.ok(result);
    }

    @GetMapping("/{id}/burn-setting")
    public R<Map<String, Object>> burnSettingAlias(@PathVariable("id") Long id) {
        return R.ok(burnAfterReadService.getSetting(AuthContext.currentUserId(), id));
    }

    @PutMapping("/{id}/burn-setting")
    public R<Map<String, Object>> updateBurnSettingAlias(
            @PathVariable("id") Long id,
            @RequestBody Map<String, Object> body
    ) {
        boolean enabled = Boolean.parseBoolean(String.valueOf(body.getOrDefault("enabled", false)));
        Object raw = body.containsKey("ttlSeconds") ? body.get("ttlSeconds") : body.getOrDefault("burnSeconds", 10);
        int seconds;
        try {
            seconds = Integer.parseInt(String.valueOf(raw));
        } catch (Exception e) {
            seconds = -1;
        }
        Long userId = AuthContext.currentUserId();
        Map<String, Object> result = burnAfterReadService.updateSetting(userId, id, enabled, seconds);
        conversationService.postBurnSystemTip(userId, id, enabled, seconds);
        return R.ok(result);
    }

    @GetMapping("/{id}/auto-delete-setting")
    public R<Map<String, Object>> autoDeleteSetting(@PathVariable("id") Long id) {
        return R.ok(autoDeleteMessageService.getSetting(AuthContext.currentUserId(), id));
    }

    @PutMapping("/{id}/auto-delete-setting")
    public R<Map<String, Object>> updateAutoDeleteSetting(@PathVariable("id") Long id,
                                                          @RequestBody Map<String, Object> body) {
        boolean enabled = Boolean.parseBoolean(String.valueOf(body.getOrDefault("enabled", false)));
        int seconds;
        try { seconds = Integer.parseInt(String.valueOf(body.getOrDefault("ttlSeconds", 86400))); }
        catch (Exception e) { seconds = -1; }
        Long userId = AuthContext.currentUserId();
        Map<String, Object> result = autoDeleteMessageService.updateSetting(userId, id, enabled, seconds);
        Integer effectiveSeconds = autoDeleteMessageService.resolveEffectiveTtlSeconds(userId, id);
        conversationService.postAutoDeleteSystemTip(
                userId, id, enabled, effectiveSeconds == null ? seconds : effectiveSeconds);
        return R.ok(result);
    }

    @PostMapping("/{id}/group/member-friend-allowed")
    public R<Void> setMemberFriendAllowed(@PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        boolean allowed = Boolean.parseBoolean(String.valueOf(body.get("memberFriendAllowed")));
        conversationService.setMemberFriendAllowed(AuthContext.currentUserId(), id, allowed);
        return R.ok();
    }

    /** 待审核加群申请列表 */
    @GetMapping("/{id}/group/join-requests")
    public R<List<GroupJoinRequestVO>> listJoinRequests(@PathVariable("id") Long id) {
        return R.ok(conversationService.listJoinRequests(AuthContext.currentUserId(), id));
    }

    /** 同意加群申请 */
    @PostMapping("/{id}/group/join-requests/{requestId}/approve")
    public R<Void> approveJoinRequest(@PathVariable("id") Long id, @PathVariable Long requestId) {
        conversationService.approveJoinRequest(AuthContext.currentUserId(), id, requestId);
        return R.ok();
    }

    /** 拒绝加群申请 */
    @PostMapping("/{id}/group/join-requests/{requestId}/reject")
    public R<Void> rejectJoinRequest(
            @PathVariable("id") Long id,
            @PathVariable Long requestId,
            @RequestBody(required = false) Map<String, Object> body
    ) {
        String remark = null;
        if (body != null && body.get("remark") != null) {
            remark = String.valueOf(body.get("remark"));
        }
        conversationService.rejectJoinRequest(AuthContext.currentUserId(), id, requestId, remark);
        return R.ok();
    }

    @PutMapping("/{id}/group/title")
    public R<Void> updateGroupTitle(@PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        String title = body.get("title") == null ? "" : String.valueOf(body.get("title"));
        conversationService.updateGroupTitle(AuthContext.currentUserId(), id, title);
        return R.ok();
    }

    @PostMapping("/{id}/group/leave")
    public R<Void> leaveGroup(@PathVariable("id") Long id) {
        conversationService.leaveGroup(AuthContext.currentUserId(), id);
        return R.ok();
    }

    @PutMapping("/{id}/group/notice")
    public R<Void> updateNotice(@PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        String notice = body.get("notice") == null ? "" : String.valueOf(body.get("notice"));
        conversationService.updateGroupNotice(AuthContext.currentUserId(), id, notice);
        return R.ok();
    }

    @PutMapping("/{id}/group/avatar")
    public R<Void> updateAvatar(@PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        String avatarUrl = body.get("avatarUrl") == null ? "" : String.valueOf(body.get("avatarUrl"));
        conversationService.updateGroupAvatar(AuthContext.currentUserId(), id, avatarUrl);
        return R.ok();
    }

    @PostMapping("/{id}/group/members/role")
    public R<Void> setMemberRole(@PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        Long targetUserId = Long.valueOf(String.valueOf(body.get("userId")));
        String role = body.get("role") == null ? "" : String.valueOf(body.get("role"));
        conversationService.setMemberRole(AuthContext.currentUserId(), id, targetUserId, role);
        return R.ok();
    }

    /** 全员禁言开关 */
    @PostMapping("/{id}/group/mute-all")
    public R<Void> setMuteAll(@PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        boolean muteAll = Boolean.parseBoolean(String.valueOf(body.get("muteAll")));
        conversationService.setGroupMuteAll(AuthContext.currentUserId(), id, muteAll);
        return R.ok();
    }

    /** 禁言 / 解除禁言指定成员 */
    @PostMapping("/{id}/group/members/speak-mute")
    public R<Void> setSpeakMute(@PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        Long targetUserId = Long.valueOf(String.valueOf(body.get("userId")));
        boolean speakMuted = Boolean.parseBoolean(String.valueOf(body.get("speakMuted")));
        conversationService.setMemberSpeakMuted(AuthContext.currentUserId(), id, targetUserId, speakMuted);
        return R.ok();
    }

    @PostMapping("/{id}/group/members")
    public R<Void> addMembers(@PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        List<Long> memberIds = new java.util.ArrayList<>();
        Object raw = body.get("memberIds");
        if (raw instanceof List<?> list) {
            for (Object o : list) {
                if (o != null) memberIds.add(Long.valueOf(String.valueOf(o)));
            }
        }
        conversationService.addGroupMembers(AuthContext.currentUserId(), id, memberIds);
        return R.ok();
    }

    @PostMapping("/{id}/group/members/remove")
    public R<Void> removeMember(@PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        Long targetUserId = Long.valueOf(String.valueOf(body.get("userId")));
        conversationService.removeGroupMember(AuthContext.currentUserId(), id, targetUserId);
        return R.ok();
    }

    @PostMapping("/{id}/group/transfer")
    public R<Void> transfer(@PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        Long newOwnerId = Long.valueOf(String.valueOf(body.get("userId")));
        conversationService.transferOwner(AuthContext.currentUserId(), id, newOwnerId);
        return R.ok();
    }

    @PostMapping("/{id}/group/dissolve")
    public R<Void> dissolve(@PathVariable("id") Long id) {
        conversationService.dissolveGroup(AuthContext.currentUserId(), id);
        return R.ok();
    }

    /** 会话个人设置：置顶 / 免打扰 */
    @PutMapping("/{id}/settings")
    public R<Void> settings(@PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        Boolean pinned = body.get("pinned") == null ? null : Boolean.valueOf(String.valueOf(body.get("pinned")));
        Boolean mute = body.get("mute") == null ? null : Boolean.valueOf(String.valueOf(body.get("mute")));
        Boolean hidden = body.get("hidden") == null ? null : Boolean.valueOf(String.valueOf(body.get("hidden")));
        String groupNickname = body.get("groupNickname") == null ? null : String.valueOf(body.get("groupNickname"));
        String groupRemark = body.get("groupRemark") == null ? null : String.valueOf(body.get("groupRemark"));
        conversationService.updateMemberSettings(
                AuthContext.currentUserId(), id, pinned, mute, hidden, groupNickname, groupRemark);
        return R.ok();
    }

    /** 群搜索方式：1 不允许，2 仅群号，3 群号及关键词。 */
    @PostMapping("/{id}/group/search-mode")
    public R<Void> setSearchMode(@PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        int mode;
        try {
            mode = Integer.parseInt(String.valueOf(body.get("searchMode")));
        } catch (Exception e) {
            mode = 0;
        }
        conversationService.setGroupSearchMode(AuthContext.currentUserId(), id, mode);
        return R.ok();
    }

    /** 是否允许普通群成员邀请好友入群。 */
    @PostMapping("/{id}/group/member-invite-allowed")
    public R<Void> setMemberInviteAllowed(@PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        boolean allowed = Boolean.parseBoolean(String.valueOf(body.get("memberInviteAllowed")));
        conversationService.setMemberInviteAllowed(AuthContext.currentUserId(), id, allowed);
        return R.ok();
    }

    /** 设为未读 */
    @PostMapping("/{id}/unread")
    public R<Void> markUnread(@PathVariable("id") Long id) {
        conversationService.setUnread(AuthContext.currentUserId(), id, 1);
        return R.ok();
    }

    /** 归档 / 取消归档 */
    @PostMapping("/{id}/archive")
    public R<Void> archive(@PathVariable("id") Long id, @RequestBody(required = false) Map<String, Object> body) {
        boolean archived = body == null || body.get("archived") == null || Boolean.parseBoolean(String.valueOf(body.get("archived")));
        conversationService.setArchived(AuthContext.currentUserId(), id, archived);
        return R.ok();
    }

    /** 从会话列表移除（对本端隐藏，有新消息时再显示） */
    @PostMapping("/{id}/remove")
    public R<Void> remove(@PathVariable("id") Long id) {
        conversationService.removeConversation(AuthContext.currentUserId(), id);
        return R.ok();
    }

    /** 删除好友私聊历史：仅自己或双方。 */
    @PostMapping("/{id}/delete")
    public R<Void> delete(@PathVariable("id") Long id, @RequestBody(required = false) Map<String, Object> body) {
        boolean forBoth = body != null && "both".equals(String.valueOf(body.get("scope")));
        conversationService.deletePrivateConversation(AuthContext.currentUserId(), id, forBoth);
        return R.ok();
    }

    @PostMapping("/{id}/group/clear-history")
    public R<Void> clearGroupHistory(@PathVariable("id") Long id,
                                     @RequestBody(required = false) Map<String, Object> body) {
        boolean forAll = body != null && "both".equals(String.valueOf(body.get("scope")));
        conversationService.clearGroupHistory(AuthContext.currentUserId(), id, forAll);
        return R.ok();
    }

    /** 全部已读（非归档会话） */
    @PostMapping("/read-all")
    public R<Void> readAll() {
        conversationService.markAllRead(AuthContext.currentUserId());
        return R.ok();
    }

    /** 批量：delete / archive / unarchive / read / unread */
    @PostMapping("/batch")
    public R<Void> batch(@RequestBody Map<String, Object> body) {
        String action = body.get("action") == null ? "" : String.valueOf(body.get("action"));
        List<Long> ids = new java.util.ArrayList<>();
        Object raw = body.get("ids");
        if (raw instanceof List<?> list) {
            for (Object o : list) {
                if (o != null) ids.add(Long.valueOf(String.valueOf(o)));
            }
        }
        conversationService.batchAction(AuthContext.currentUserId(), ids, action);
        return R.ok();
    }
}
