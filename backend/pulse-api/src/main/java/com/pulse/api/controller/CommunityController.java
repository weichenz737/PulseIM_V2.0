package com.pulse.api.controller;

import com.pulse.api.security.AuthContext;
import com.pulse.api.service.CommunityService;
import com.pulse.common.result.R;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController @RequestMapping("/api/v1/communities") @RequiredArgsConstructor
public class CommunityController {
    private final CommunityService service;
    @GetMapping("/topics") public R<?> topics(){return R.ok(service.topics(false));}
    @GetMapping("/report-reasons") public R<?> reportReasons(){return R.ok(service.reportReasons(false));}
    @GetMapping("/member-removal-reasons") public R<?> memberRemovalReasons(){return R.ok(service.memberRemovalReasons(false));}
    @GetMapping("/favorites") public R<?> favorites(){return R.ok(service.favoritePosts(AuthContext.currentUserId()));}
    @GetMapping public R<?> list(@RequestParam(required=false)String keyword,@RequestParam(required=false)Long topicId,@RequestParam(defaultValue="1")int page,@RequestParam(defaultValue="20")int size){return R.ok(service.browse(AuthContext.currentUserId(),keyword,topicId,page,size));}
    @GetMapping("/mine") public R<?> mine(){return R.ok(service.mine(AuthContext.currentUserId()));}
    @PostMapping public R<?> create(@RequestBody Map<String,Object>b){return R.ok(service.create(AuthContext.currentUserId(),b));}
    @GetMapping("/{id}") public R<?> detail(@PathVariable long id){return R.ok(service.detail(AuthContext.currentUserId(),id));}
    @PutMapping("/{id}") public R<?> update(@PathVariable long id,@RequestBody Map<String,Object>b){return R.ok(service.updateCommunity(AuthContext.currentUserId(),id,b));}
    @PostMapping("/{id}/join") public R<?> join(@PathVariable long id,@RequestBody(required=false)Map<String,Object>b){return R.ok(service.join(AuthContext.currentUserId(),id,b==null?null:String.valueOf(b.getOrDefault("paymentPassword","")),b!=null&&Boolean.parseBoolean(String.valueOf(b.getOrDefault("agreementAccepted",false)))));}
    @GetMapping("/{id}/posts") public R<?> posts(@PathVariable long id){return R.ok(service.posts(AuthContext.currentUserId(),id));}
    @GetMapping("/{id}/manage/posts") public R<?> managePosts(@PathVariable long id,@RequestParam(required=false)String keyword,@RequestParam(required=false)String startDate,@RequestParam(required=false)String endDate,@RequestParam(defaultValue="LATEST")String sort,@RequestParam(defaultValue="1")int page,@RequestParam(defaultValue="200")int size){return R.ok(service.managePosts(AuthContext.currentUserId(),id,keyword,startDate,endDate,sort,page,size));}
    @GetMapping("/{id}/reports") public R<?> manageReports(@PathVariable long id,@RequestParam(required=false)String status,@RequestParam(required=false)String keyword,@RequestParam(defaultValue="1")int page,@RequestParam(defaultValue="100")int size){return R.ok(service.managerReports(AuthContext.currentUserId(),id,status,keyword,page,size));}
    @PutMapping("/{id}/reports/{reportId}/post") public R<Void> moderateManagedReport(@PathVariable long id,@PathVariable long reportId,@RequestBody Map<String,Object>b){service.moderateManagerReportedPost(AuthContext.currentUserId(),id,reportId,String.valueOf(b.get("status")));return R.ok();}
    @PostMapping("/{id}/posts") public R<?> publish(@PathVariable long id,@RequestBody Map<String,Object>b){return R.ok(service.publish(AuthContext.currentUserId(),id,b));}
    @GetMapping("/posts/{postId}") public R<?> postDetail(@PathVariable long postId){return R.ok(service.postDetail(AuthContext.currentUserId(),postId));}
    @PostMapping("/posts/{postId}/forward") public R<?> forwardPost(@PathVariable long postId,@RequestBody(required=false) Map<String,Object>b){return R.ok(service.forwardPost(AuthContext.currentUserId(),postId,b==null?"":String.valueOf(b.getOrDefault("opinion",""))));}
    @DeleteMapping("/posts/{postId}") public R<Void> deletePost(@PathVariable long postId){service.deletePost(AuthContext.currentUserId(),postId);return R.ok();}
    @PutMapping("/posts/{postId}/pin") public R<?> pinPost(@PathVariable long postId,@RequestBody Map<String,Object>b){return R.ok(service.setPostPinned(AuthContext.currentUserId(),postId,Boolean.parseBoolean(String.valueOf(b.getOrDefault("pinned",true)))));}
    @PutMapping("/posts/{postId}/status") public R<Void> postStatus(@PathVariable long postId,@RequestBody Map<String,Object>b){service.moderatePostByManager(AuthContext.currentUserId(),postId,String.valueOf(b.get("status")));return R.ok();}
    @PostMapping("/posts/{postId}/like") public R<?> like(@PathVariable long postId){return R.ok(service.toggleLike(AuthContext.currentUserId(),postId));}
    @GetMapping("/posts/{postId}/comments") public R<?> comments(@PathVariable long postId){return R.ok(service.comments(AuthContext.currentUserId(),postId));}
    @PostMapping("/posts/{postId}/comments") public R<?> comment(@PathVariable long postId,@RequestBody Map<String,Object>b){return R.ok(service.comment(AuthContext.currentUserId(),postId,String.valueOf(b.getOrDefault("content","")),b.get("parentId")==null?null:Long.valueOf(String.valueOf(b.get("parentId")))));}
    @PostMapping("/posts/comments/{commentId}/delete") public R<Void> deleteComment(@PathVariable long commentId){service.deleteComment(AuthContext.currentUserId(),commentId);return R.ok();}
    @PostMapping("/posts/comments/{commentId}/like") public R<?> likeComment(@PathVariable long commentId){return R.ok(service.toggleCommentLike(AuthContext.currentUserId(),commentId));}
    @PostMapping("/posts/{postId}/favorite") public R<?> favorite(@PathVariable long postId){return R.ok(service.toggleFavorite(AuthContext.currentUserId(),postId));}
    @PostMapping("/reports") public R<Void> report(@RequestBody Map<String,Object>b){Object reason=b.containsKey("reasonCode")?b.get("reasonCode"):b.get("reason");service.report(AuthContext.currentUserId(),String.valueOf(b.get("targetType")),Long.parseLong(String.valueOf(b.get("targetId"))),reason==null?null:String.valueOf(reason),b.get("detail")==null?null:String.valueOf(b.get("detail")),b.get("evidenceUrls"),b.get("evidenceTypes"));return R.ok();}
    @GetMapping("/notifications") public R<?> notifications(){return R.ok(service.notifications(AuthContext.currentUserId()));}
    @GetMapping("/notifications/unread-count") public R<?> notificationUnreadCount(){return R.ok(service.notificationUnreadCount(AuthContext.currentUserId()));}
    @PostMapping("/notifications/read") public R<Void> notificationsRead(){service.markNotificationsRead(AuthContext.currentUserId());return R.ok();}
    @DeleteMapping("/notifications/{notificationId}") public R<Void> deleteNotification(@PathVariable long notificationId){service.deleteNotification(AuthContext.currentUserId(),notificationId);return R.ok();}
    @GetMapping("/{id}/members") public R<?> members(@PathVariable long id,@RequestParam(required=false)String keyword,@RequestParam(required=false)String status){return R.ok(service.members(AuthContext.currentUserId(),id,keyword,status));}
    @PutMapping("/{id}/members/{memberId}/status") public R<Void> memberStatus(@PathVariable long id,@PathVariable long memberId,@RequestBody Map<String,Object>b){Object reasonCode=b.get("reasonCode");Object reasonDetail=b.get("reasonDetail");service.setMemberStatus(AuthContext.currentUserId(),id,memberId,String.valueOf(b.get("status")),b.get("reason")==null?"":String.valueOf(b.get("reason")),reasonCode==null?"":String.valueOf(reasonCode),reasonDetail==null?"":String.valueOf(reasonDetail));return R.ok();}
    @PutMapping("/{id}/members/{memberId}/admin") public R<Void> memberAdmin(@PathVariable long id,@PathVariable long memberId,@RequestBody Map<String,Object>b){service.setAdmin(AuthContext.currentUserId(),id,memberId,Boolean.parseBoolean(String.valueOf(b.get("admin"))));return R.ok();}
    @PutMapping("/{id}/members/{memberId}/permissions") public R<Void> memberPermissions(@PathVariable long id,@PathVariable long memberId,@RequestBody Map<String,Object>b){service.setPermissions(AuthContext.currentUserId(),id,memberId,(Collection<?>)b.get("permissions"));return R.ok();}
    @GetMapping("/{id}/dashboard") public R<?> dashboard(@PathVariable long id){return R.ok(service.dashboard(AuthContext.currentUserId(),id));}
    @GetMapping("/{id}/dashboard/details") public R<?> dashboardDetails(@PathVariable long id,@RequestParam String type){return R.ok(service.dashboardDetails(AuthContext.currentUserId(),id,type));}
    @GetMapping("/{id}/join-requests") public R<?> joinRequests(@PathVariable long id){return R.ok(service.joinRequests(AuthContext.currentUserId(),id));}
    @PutMapping("/{id}/join-requests/{requestId}") public R<Void> reviewJoinRequest(@PathVariable long id,@PathVariable long requestId,@RequestBody Map<String,Object>b){service.reviewJoinRequest(AuthContext.currentUserId(),id,requestId,String.valueOf(b.get("status")));return R.ok();}
    @PostMapping("/{id}/leave") public R<?> leave(@PathVariable long id,@RequestBody(required=false)Map<String,Object>b){return R.ok(service.leaveCommunity(AuthContext.currentUserId(),id,b==null?"":String.valueOf(b.getOrDefault("reason",""))));}
    @GetMapping("/{id}/leave-requests") public R<?> leaveRequests(@PathVariable long id){return R.ok(service.leaveRequests(AuthContext.currentUserId(),id));}
    @PutMapping("/{id}/leave-requests/{requestId}") public R<Void> reviewLeaveRequest(@PathVariable long id,@PathVariable long requestId,@RequestBody Map<String,Object>b){service.reviewLeaveRequest(AuthContext.currentUserId(),id,requestId,String.valueOf(b.get("status")),String.valueOf(b.getOrDefault("reason","")));return R.ok();}
    @PutMapping("/{id}/owner") public R<Void> transferOwner(@PathVariable long id,@RequestBody Map<String,Object>b){service.transferOwnership(AuthContext.currentUserId(),id,Long.parseLong(String.valueOf(b.get("userId"))),String.valueOf(b.getOrDefault("reason","")));return R.ok();}
    @DeleteMapping("/{id}") public R<Void> dissolve(@PathVariable long id,@RequestBody(required=false)Map<String,Object>b){service.dissolveCommunity(AuthContext.currentUserId(),id,b==null?"":String.valueOf(b.getOrDefault("reason","")));return R.ok();}
}
