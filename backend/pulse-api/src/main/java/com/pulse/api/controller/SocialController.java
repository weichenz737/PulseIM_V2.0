package com.pulse.api.controller;

import com.pulse.api.security.AuthContext;
import com.pulse.api.service.ConversationService;
import com.pulse.api.service.LoginLogService;
import com.pulse.api.service.GroupMemberEventService;
import com.pulse.api.service.SocialService;
import com.pulse.api.vo.ContactVO;
import com.pulse.api.vo.FavoriteVO;
import com.pulse.api.vo.FriendRequestVO;
import com.pulse.api.vo.GlobalSearchVO;
import com.pulse.api.vo.MessageVO;
import com.pulse.api.vo.MomentCommentVO;
import com.pulse.api.vo.MomentInteractionVO;
import com.pulse.api.vo.MomentVO;
import com.pulse.api.vo.MomentsUpdateVO;
import com.pulse.api.vo.PrivacySettingsVO;
import com.pulse.api.vo.UserProfileVO;
import com.pulse.common.result.R;
import lombok.RequiredArgsConstructor;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class SocialController {
    private final SocialService socialService;
    private final ConversationService conversationService;
    private final LoginLogService loginLogService;
    private final GroupMemberEventService groupMemberEventService;

    @PostMapping("/user/online-log")
    public R<Void> recordOnline() {
        loginLogService.recordOnline(AuthContext.currentUserId());
        return R.ok();
    }

    @GetMapping("/contacts")
    public R<Map<String, Object>> contacts() {
        List<ContactVO> list = socialService.listContacts(AuthContext.currentUserId());
        return R.ok(Map.of("list", list));
    }

    @GetMapping("/user/group-notifications")
    public R<Map<String, Object>> myGroupNotifications() {
        Long uid = AuthContext.currentUserId();
        return R.ok(Map.of(
                "events", groupMemberEventService.listUserNotifications(uid),
                "invites", conversationService.listMyGroupInviteHistory(uid),
                "joinRequests", conversationService.listManagedGroupJoinRequests(uid),
                "pendingCount", conversationService.countMyGroupInvites(uid)
                        + conversationService.countManagedPendingJoinRequests(uid)
        ));
    }

    /** 查询用户在线状态（IM WebSocket 写入 Redis）；被对方拉黑时返回离线 */
    @GetMapping("/users/{userId}/online")
    public R<Map<String, Object>> userOnline(@PathVariable("userId") Long userId) {
        boolean hidden = socialService.isOnlineHiddenFor(AuthContext.currentUserId(), userId);
        return R.ok(Map.of(
                "online",
                !hidden && socialService.isUserOnlineVisibleTo(AuthContext.currentUserId(), userId),
                "onlineHidden",
                hidden
        ));
    }

    @GetMapping("/conversations/{id}/messages")
    public R<List<MessageVO>> messages(
            @PathVariable("id") Long id,
            @RequestParam(value = "after", required = false) String after,
            @RequestParam(value = "before", required = false) String before,
            @RequestParam(value = "limit", required = false) Integer limit
    ) {
        return R.ok(socialService.listMessages(AuthContext.currentUserId(), id, after, before, limit));
    }

    @GetMapping("/conversations/{id}/messages/search")
    public R<List<MessageVO>> searchMessages(
            @PathVariable("id") Long id,
            @RequestParam(value = "q", required = false) String q,
            @RequestParam(value = "filter", required = false) String filter,
            @RequestParam(value = "from", required = false) String from,
            @RequestParam(value = "to", required = false) String to
    ) {
        return R.ok(socialService.searchMessages(AuthContext.currentUserId(), id, q, filter, from, to));
    }

    @PostMapping("/conversations/{id}/messages")
    public R<MessageVO> sendMessage(@PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        String content = body.get("content") == null ? "" : String.valueOf(body.get("content"));
        Long toUserId = null;
        Object rawToUserId = body.get("toUserId");
        if (rawToUserId != null && StringUtils.hasText(String.valueOf(rawToUserId))) {
            try {
                toUserId = Long.valueOf(String.valueOf(rawToUserId));
            } catch (NumberFormatException ignored) {
                // 会话已经包含接收方时允许省略 toUserId，避免无意义的 500。
                toUserId = null;
            }
        }
        String clientMsgId = body.get("clientMsgId") == null ? null : String.valueOf(body.get("clientMsgId"));
        String replyToMsgId = body.get("replyToMsgId") == null ? null : String.valueOf(body.get("replyToMsgId"));
        if (replyToMsgId != null && (replyToMsgId.isBlank() || "null".equals(replyToMsgId))) {
            replyToMsgId = null;
        }
        int msgType = 0;
        if (body.get("msgType") != null) {
            try {
                msgType = Integer.parseInt(String.valueOf(body.get("msgType")));
            } catch (Exception ignored) {
                msgType = 0;
            }
        }
        // 0文本 1图片 2文件 3语音 4聊天记录 5名片 9系统提示
        if (msgType < 0 || msgType > 9 || msgType == 7 || msgType == 8) {
            msgType = 0;
        }
        boolean atAll = false;
        if (body.get("atAll") != null) {
            atAll = Boolean.parseBoolean(String.valueOf(body.get("atAll")));
        }
        List<Long> mentionUserIds = new ArrayList<>();
        if (body.get("mentionUserIds") instanceof List<?> list) {
            for (Object o : list) {
                if (o == null) continue;
                try {
                    mentionUserIds.add(Long.valueOf(String.valueOf(o)));
                } catch (Exception ignored) {
                    // skip
                }
            }
        }
        String fileId = body.get("fileId") == null ? null : String.valueOf(body.get("fileId"));
        if (fileId != null && (fileId.isBlank() || "null".equalsIgnoreCase(fileId))) fileId = null;
        return R.ok(socialService.sendMessage(
                AuthContext.currentUserId(), id, toUserId, content, clientMsgId, replyToMsgId, msgType,
                mentionUserIds, atAll, fileId));
    }

    @PostMapping("/conversations/{id}/messages/{msgId}/recall")
    public R<MessageVO> recallMessage(@PathVariable("id") Long id, @PathVariable("msgId") String msgId) {
        return R.ok(socialService.recallMessage(AuthContext.currentUserId(), id, msgId));
    }

    @PostMapping("/conversations/{id}/messages/delete")
    public R<Void> deleteMessages(@PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<String> msgIds = body.get("msgIds") instanceof List
                ? ((List<?>) body.get("msgIds")).stream().map(String::valueOf).toList()
                : List.of();
        boolean both = "both".equalsIgnoreCase(String.valueOf(body.getOrDefault("mode", "self")));
        socialService.hideMessages(AuthContext.currentUserId(), id, msgIds, both);
        return R.ok();
    }

    @GetMapping("/conversations/{id}/messages/{msgId}")
    public R<MessageVO> getMessage(@PathVariable("id") Long id, @PathVariable("msgId") String msgId) {
        return R.ok(socialService.getMessage(AuthContext.currentUserId(), id, msgId));
    }

    @PostMapping("/conversations/{id}/messages/forward")
    public R<Map<String, Object>> forwardMessages(@PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        List<Long> targetIds = new java.util.ArrayList<>();
        if (body.get("targetConversationIds") instanceof List<?> list) {
            for (Object o : list) {
                if (o != null) targetIds.add(Long.valueOf(String.valueOf(o)));
            }
        }
        if (targetIds.isEmpty() && body.get("targetConversationId") != null) {
            targetIds.add(Long.valueOf(String.valueOf(body.get("targetConversationId"))));
        }
        List<String> msgIds = body.get("msgIds") instanceof List
                ? ((List<?>) body.get("msgIds")).stream().map(String::valueOf).toList()
                : List.of();
        String mode = body.get("mode") == null ? "merge" : String.valueOf(body.get("mode"));
        int count = socialService.forwardMessages(AuthContext.currentUserId(), id, targetIds, msgIds, mode);
        return R.ok(Map.of("count", count, "targetCount", targetIds.size()));
    }

    @PostMapping("/favorites")
    public R<FavoriteVO> addFavorite(@RequestBody Map<String, Object> body) {
        Long conversationId = Long.valueOf(String.valueOf(body.get("conversationId")));
        String msgId = body.get("msgId") == null ? null : String.valueOf(body.get("msgId"));
        return R.ok(socialService.addFavorite(AuthContext.currentUserId(), conversationId, msgId));
    }

    @GetMapping("/favorites")
    public R<List<FavoriteVO>> favorites() {
        return R.ok(socialService.listFavorites(AuthContext.currentUserId()));
    }

    @GetMapping("/favorites/{id}")
    public R<FavoriteVO> favoriteDetail(@PathVariable("id") Long id) {
        return R.ok(socialService.getFavorite(AuthContext.currentUserId(), id));
    }

    @PostMapping("/favorites/{id}/delete")
    public R<Void> deleteFavorite(@PathVariable("id") Long id) {
        socialService.removeFavorite(AuthContext.currentUserId(), id);
        return R.ok();
    }

    /** 转发收藏内容到一个或多个会话 */
    @PostMapping("/favorites/{id}/forward")
    public R<Map<String, Object>> forwardFavorite(
            @PathVariable("id") Long id,
            @RequestBody Map<String, Object> body
    ) {
        List<Long> targetIds = new ArrayList<>();
        Object rawTargets = body == null ? null : body.get("targetConversationIds");
        if (rawTargets instanceof List<?> list) {
            for (Object o : list) {
                if (o == null) continue;
                try {
                    targetIds.add(Long.valueOf(String.valueOf(o)));
                } catch (Exception ignored) {
                    // skip
                }
            }
        }
        if (targetIds.isEmpty() && body != null && body.get("targetConversationId") != null) {
            targetIds.add(Long.valueOf(String.valueOf(body.get("targetConversationId"))));
        }
        int count = socialService.forwardFavorite(AuthContext.currentUserId(), id, targetIds);
        return R.ok(Map.of("count", count, "targetCount", targetIds.size()));
    }

    @GetMapping("/user/profile")
    public R<UserProfileVO> myProfile() {
        return R.ok(socialService.getProfile(AuthContext.currentUserId(), null));
    }

    @GetMapping("/user/{userId}")
    public R<UserProfileVO> userProfile(@PathVariable Long userId) {
        return R.ok(socialService.getProfile(AuthContext.currentUserId(), userId));
    }

    @PostMapping("/contacts/{userId}")
    public R<Void> addFriend(@PathVariable Long userId, @RequestBody(required = false) Map<String, Object> body) {
        String message = body == null || body.get("message") == null ? null : String.valueOf(body.get("message"));
        String remark = body == null || body.get("remark") == null ? null : String.valueOf(body.get("remark"));
        String source = body == null || body.get("source") == null ? null : String.valueOf(body.get("source"));
        Long groupId = null;
        if (body != null) {
            Object rawGroupId = body.get("groupId") != null ? body.get("groupId") : body.get("conversationId");
            if (rawGroupId != null) {
                groupId = Long.valueOf(String.valueOf(rawGroupId));
            }
        }
        socialService.sendFriendRequest(AuthContext.currentUserId(), userId, message, remark, source, groupId);
        return R.ok();
    }

    @PostMapping("/contacts/{userId}/delete")
    public R<Void> deleteFriend(@PathVariable Long userId) {
        socialService.deleteFriend(AuthContext.currentUserId(), userId);
        return R.ok();
    }

    @PostMapping("/contacts/{userId}/block")
    public R<Void> blockUser(@PathVariable Long userId) {
        socialService.blockUser(AuthContext.currentUserId(), userId);
        return R.ok();
    }

    @PostMapping("/contacts/{userId}/unblock")
    public R<Void> unblockUser(@PathVariable Long userId) {
        socialService.unblockUser(AuthContext.currentUserId(), userId);
        return R.ok();
    }

    @PutMapping("/contacts/{userId}/remark")
    public R<Void> updateRemark(@PathVariable Long userId, @RequestBody Map<String, Object> body) {
        String remark = body.get("remark") == null ? "" : String.valueOf(body.get("remark"));
        socialService.updateFriendRemark(AuthContext.currentUserId(), userId, remark);
        return R.ok();
    }

    @PutMapping("/contacts/{userId}/moments-permission")
    public R<Void> updateMomentsPermission(@PathVariable Long userId, @RequestBody Map<String, Object> body) {
        Boolean hideHisMoments = null;
        Boolean rejectHisMoments = null;
        if (body.get("hideHisMoments") != null) {
            hideHisMoments = Boolean.parseBoolean(String.valueOf(body.get("hideHisMoments")));
        }
        if (body.get("rejectHisMoments") != null) {
            rejectHisMoments = Boolean.parseBoolean(String.valueOf(body.get("rejectHisMoments")));
        }
        socialService.updateFriendMomentsPermission(
                AuthContext.currentUserId(), userId, hideHisMoments, rejectHisMoments);
        return R.ok();
    }

    @GetMapping("/contacts/blocked")
    public R<Map<String, Object>> blockedUsers() {
        return R.ok(Map.of("list", socialService.listBlockedUsers(AuthContext.currentUserId())));
    }

    /** 不看他（她）的朋友圈名单 */
    @GetMapping("/contacts/moments-hide")
    public R<Map<String, Object>> momentsHideUsers() {
        return R.ok(Map.of("list", socialService.listMomentsHideUsers(AuthContext.currentUserId())));
    }

    /** 不让他（她）看我的朋友圈名单 */
    @GetMapping("/contacts/moments-reject")
    public R<Map<String, Object>> momentsRejectUsers() {
        return R.ok(Map.of("list", socialService.listMomentsRejectUsers(AuthContext.currentUserId())));
    }

    @GetMapping("/users/{userId}/common-groups")
    public R<Map<String, Object>> commonGroups(@PathVariable("userId") Long userId) {
        var list = socialService.listCommonGroups(AuthContext.currentUserId(), userId);
        return R.ok(Map.of("list", list, "count", list.size()));
    }

    @GetMapping("/user/pulse/{pulseId}")
    public R<UserProfileVO> userByPulseId(@PathVariable String pulseId) {
        return R.ok(socialService.getProfileByPulseId(AuthContext.currentUserId(), pulseId));
    }

    @GetMapping("/friend-requests")
    public R<Map<String, Object>> friendRequests() {
        Long uid = AuthContext.currentUserId();
        return R.ok(Map.of(
                "list", socialService.listFriendRequests(uid),
                "pendingCount", socialService.countPendingFriendRequests(uid)
        ));
    }

    @PostMapping("/friend-requests/{id}/accept")
    public R<Void> acceptFriendRequest(@PathVariable("id") Long id, @RequestBody(required = false) Map<String, Object> body) {
        String remark = body == null || body.get("remark") == null ? null : String.valueOf(body.get("remark"));
        socialService.acceptFriendRequest(AuthContext.currentUserId(), id, remark);
        return R.ok();
    }

    @PostMapping("/friend-requests/{id}/reject")
    public R<Void> rejectFriendRequest(@PathVariable("id") Long id) {
        socialService.rejectFriendRequest(AuthContext.currentUserId(), id);
        return R.ok();
    }

    @PutMapping("/user/profile")
    public R<UserProfileVO> updateProfile(@RequestBody Map<String, Object> body) {
        return R.ok(socialService.updateProfile(AuthContext.currentUserId(), body));
    }

    @GetMapping("/user/privacy")
    public R<PrivacySettingsVO> privacySettings() {
        return R.ok(socialService.getPrivacySettings(AuthContext.currentUserId()));
    }

    @PutMapping("/user/privacy")
    public R<PrivacySettingsVO> updatePrivacy(@RequestBody Map<String, Object> body) {
        return R.ok(socialService.updatePrivacySettings(AuthContext.currentUserId(), body));
    }

    /** 待我确认的群邀请 */
    @GetMapping("/user/group-invites")
    public R<Map<String, Object>> myGroupInvites() {
        Long uid = AuthContext.currentUserId();
        return R.ok(Map.of(
                "list", conversationService.listMyGroupInvites(uid),
                "pendingCount", conversationService.countMyGroupInvites(uid)
        ));
    }

    @PostMapping("/user/group-invites/{requestId}/accept")
    public R<Void> acceptGroupInvite(@PathVariable Long requestId) {
        conversationService.acceptGroupInvite(AuthContext.currentUserId(), requestId);
        return R.ok();
    }

    @PostMapping("/user/group-invites/{requestId}/reject")
    public R<Void> rejectGroupInvite(@PathVariable Long requestId) {
        conversationService.rejectGroupInvite(AuthContext.currentUserId(), requestId);
        return R.ok();
    }

    @GetMapping("/search")
    public R<GlobalSearchVO> globalSearch(@RequestParam("q") String q) {
        return R.ok(socialService.globalSearch(AuthContext.currentUserId(), q));
    }

    @GetMapping("/user/search")
    public R<UserProfileVO> search(@RequestParam String phone) {
        return R.ok(socialService.searchByPhone(phone));
    }

    @GetMapping("/moments")
    public R<List<MomentVO>> moments() {
        try {
            return R.ok(socialService.listMoments(AuthContext.currentUserId()));
        } catch (Exception e) {
            // 避免朋友圈入口因单条脏数据 500
            return R.ok(List.of());
        }
    }

    @GetMapping("/users/{userId}/moments")
    public R<List<MomentVO>> userMoments(@PathVariable("userId") Long userId) {
        try {
            return R.ok(socialService.listUserMoments(AuthContext.currentUserId(), userId));
        } catch (Exception e) {
            // 单用户朋友圈失败不拖垮页面
            org.slf4j.LoggerFactory.getLogger(getClass())
                    .warn("listUserMoments failed userId={}: {}", userId, e.toString());
            return R.ok(List.of());
        }
    }

    /** 发现页：好友新朋友圈头像提醒 */
    @GetMapping("/moments/updates")
    public R<MomentsUpdateVO> momentUpdates() {
        return R.ok(socialService.listMomentUpdates(AuthContext.currentUserId()));
    }

    /** 进入朋友圈后标记已读 */
    @PostMapping("/moments/seen")
    public R<Void> markMomentsSeen() {
        socialService.markMomentsSeen(AuthContext.currentUserId());
        return R.ok();
    }

    /** 朋友圈互动通知列表（点赞/评论/回复/@） */
    @GetMapping("/moments/interactions")
    public R<List<MomentInteractionVO>> momentInteractions(@RequestParam(required = false) Integer limit) {
        return R.ok(socialService.listMomentInteractions(AuthContext.currentUserId(), limit));
    }

    /** 朋友圈互动未读角标 */
    @GetMapping("/moments/interactions/unread-count")
    public R<Map<String, Object>> momentInteractionUnreadCount() {
        long count = socialService.countUnreadMomentInteractions(AuthContext.currentUserId());
        return R.ok(Map.of("count", count));
    }

    /** 标记互动通知已读；body 可传 id 标记单条，不传则全部已读 */
    @PostMapping("/moments/interactions/read")
    public R<Void> markMomentInteractionsRead(@RequestBody(required = false) Map<String, Object> body) {
        Long id = null;
        if (body != null && body.get("id") != null && StringUtils.hasText(String.valueOf(body.get("id")))) {
            try {
                id = Long.parseLong(String.valueOf(body.get("id")));
            } catch (NumberFormatException ignored) {
                id = null;
            }
        }
        socialService.markMomentInteractionsRead(AuthContext.currentUserId(), id);
        return R.ok();
    }

    @GetMapping("/moments/{id}")
    public R<MomentVO> momentDetail(@PathVariable("id") Long id) {
        return R.ok(socialService.getMoment(AuthContext.currentUserId(), id));
    }

    @PostMapping("/moments")
    public R<MomentVO> createMoment(@RequestBody Map<String, Object> body) {
        String content = body.get("content") == null ? "" : String.valueOf(body.get("content"));
        List<String> images = body.get("images") instanceof List<?> l
                ? l.stream().map(String::valueOf).filter(s -> s != null && !s.isBlank()).toList()
                : List.of();
        List<String> originalImages = body.get("originalImages") instanceof List<?> l
                ? l.stream().map(String::valueOf).filter(s -> s != null && !s.isBlank()).toList()
                : List.of();
        List<String> mediaTypes = body.get("mediaTypes") instanceof List<?> l
                ? l.stream().map(String::valueOf).toList()
                : List.of();
        List<String> mediaFileIds = body.get("mediaFileIds") instanceof List<?> l
                ? l.stream().map(String::valueOf).toList()
                : List.of();
        Integer visibility = null;
        if (body.get("visibility") != null) {
            try {
                visibility = Integer.parseInt(String.valueOf(body.get("visibility")));
            } catch (Exception ignored) {
                visibility = 0;
            }
        }
        List<Long> mentionUserIds = new ArrayList<>();
        if (body.get("mentionUserIds") instanceof List<?> list) {
            for (Object o : list) {
                if (o != null) mentionUserIds.add(Long.valueOf(String.valueOf(o)));
            }
        }
        List<Long> visibleUserIds = new ArrayList<>();
        if (body.get("visibleUserIds") instanceof List<?> list) {
            for (Object o : list) {
                if (o != null) visibleUserIds.add(Long.valueOf(String.valueOf(o)));
            }
        }
        String locationName = body.get("locationName") == null ? null : String.valueOf(body.get("locationName")).trim();
        String locationAddress = body.get("locationAddress") == null ? null : String.valueOf(body.get("locationAddress")).trim();
        Double latitude = parseDouble(body.get("latitude"));
        Double longitude = parseDouble(body.get("longitude"));
        return R.ok(socialService.createMoment(
                AuthContext.currentUserId(), content, images, originalImages, mediaTypes, mediaFileIds,
                visibility, mentionUserIds, visibleUserIds,
                locationName, locationAddress, latitude, longitude));
    }

    @PostMapping("/moments/check-content")
    public R<Void> checkDynamicContent(@RequestBody Map<String, Object> body) {
        String content = body.get("content") == null ? "" : String.valueOf(body.get("content"));
        socialService.assertDynamicContentClean(content);
        return R.ok();
    }

    private Double parseDouble(Object value) {
        if (value == null || !StringUtils.hasText(String.valueOf(value))) return null;
        try {
            return Double.parseDouble(String.valueOf(value));
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    @PostMapping("/moments/{id}/like")
    public R<MomentVO> toggleMomentLike(@PathVariable("id") Long id) {
        return R.ok(socialService.toggleMomentLike(AuthContext.currentUserId(), id));
    }

    @PostMapping("/moments/{id}/favorite")
    public R<MomentVO> toggleMomentFavorite(@PathVariable("id") Long id) {
        return R.ok(socialService.toggleMomentFavorite(AuthContext.currentUserId(), id));
    }

    @PostMapping("/moments/{id}/comments")
    public R<MomentCommentVO> addMomentComment(@PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        String content = body.get("content") == null ? "" : String.valueOf(body.get("content"));
        Long replyToCommentId = null;
        if (body.get("replyToCommentId") != null && StringUtils.hasText(String.valueOf(body.get("replyToCommentId")))) {
            try {
                replyToCommentId = Long.parseLong(String.valueOf(body.get("replyToCommentId")));
            } catch (NumberFormatException ignored) {
                replyToCommentId = null;
            }
        }
        String imageFileId = body.get("imageFileId") == null ? null : String.valueOf(body.get("imageFileId")).trim();
        if (!StringUtils.hasText(imageFileId) || "null".equalsIgnoreCase(imageFileId)) {
            imageFileId = null;
        }
        String imageUrl = body.get("imageUrl") == null ? null : String.valueOf(body.get("imageUrl")).trim();
        if (!StringUtils.hasText(imageUrl)) {
            imageUrl = null;
        }
        return R.ok(socialService.addMomentComment(
                AuthContext.currentUserId(), id, content, replyToCommentId, imageFileId, imageUrl));
    }

    @PostMapping("/moments/comments/{commentId}/delete")
    public R<Void> deleteMomentComment(@PathVariable("commentId") Long commentId) {
        socialService.deleteMomentComment(AuthContext.currentUserId(), commentId);
        return R.ok();
    }

    @PostMapping("/moments/{id}/delete")
    public R<Void> deleteMoment(@PathVariable("id") Long id) {
        socialService.deleteMoment(AuthContext.currentUserId(), id);
        return R.ok();
    }

    @PutMapping("/moments/{id}/visibility")
    public R<MomentVO> updateMomentVisibility(@PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        Integer visibility = null;
        if (body.get("visibility") != null) {
            try {
                visibility = Integer.parseInt(String.valueOf(body.get("visibility")));
            } catch (Exception ignored) {
                visibility = 0;
            }
        }
        List<Long> visibleUserIds = new ArrayList<>();
        if (body.get("visibleUserIds") instanceof List<?> list) {
            for (Object o : list) {
                if (o != null) visibleUserIds.add(Long.valueOf(String.valueOf(o)));
            }
        }
        return R.ok(socialService.updateMomentVisibility(
                AuthContext.currentUserId(), id, visibility, visibleUserIds));
    }
}
