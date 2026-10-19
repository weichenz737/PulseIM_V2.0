package com.pulse.api.controller;

import com.pulse.api.security.AuthContext;
import com.pulse.api.service.CommunityService;
import com.pulse.common.exception.BizException;
import com.pulse.common.result.R;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.math.BigDecimal;
import java.util.Map;

@RestController @RequestMapping("/api/admin/communities") @RequiredArgsConstructor
public class AdminCommunityController {
    private final CommunityService service;
    @GetMapping public R<?> list(@RequestParam(required=false)String status,@RequestParam(required=false)String keyword,@RequestParam(required=false)String type,@RequestParam(required=false)Long topicId,@RequestParam(defaultValue="1")int page,@RequestParam(defaultValue="20")int size){return R.ok(service.adminList(status,keyword,type,topicId,page,size));}
    @GetMapping("/orders") public R<?> orders(@RequestParam(required=false)String status,@RequestParam(required=false)String keyword,@RequestParam(defaultValue="1")int page,@RequestParam(defaultValue="20")int size){return R.ok(service.adminOrders(status,keyword,page,size));}
    @GetMapping("/incomes") public R<?> incomes(@RequestParam(required=false)String keyword,@RequestParam(defaultValue="1")int page,@RequestParam(defaultValue="20")int size){return R.ok(service.adminIncomeDetails(keyword,page,size));}
    @GetMapping("/{id}/members") public R<?> members(@PathVariable long id,@RequestParam(required=false)String keyword,@RequestParam(required=false,defaultValue="ACTIVE")String status){return R.ok(service.adminMembers(id,keyword,status));}
    @GetMapping("/{id}") public R<?> detail(@PathVariable long id){return R.ok(service.adminDetail(id));}
    @PutMapping("/{id}/owner") public R<Void> transferOwner(@PathVariable long id,@RequestBody Map<String,Object>b){
        Object newOwner=b==null?null:b.get("userId");
        if(newOwner==null||String.valueOf(newOwner).isBlank()) throw new BizException("请选择新圈主");
        long newOwnerId;
        try { newOwnerId=Long.parseLong(String.valueOf(newOwner)); }
        catch (NumberFormatException e) { throw new BizException("新圈主无效"); }
        String reason=b==null?"":String.valueOf(b.getOrDefault("reason",""));
        service.adminTransferOwnership(id,newOwnerId,reason,AuthContext.currentUserId());
        return R.ok();
    }
    @PutMapping("/{id}/revenue") public R<Void> revenue(@PathVariable long id,@RequestBody Map<String,Object>b){Object value=b.get("platformRate");service.communityRevenueConfig(id,value==null||String.valueOf(value).isBlank()?null:new BigDecimal(String.valueOf(value)));return R.ok();}
    @DeleteMapping("/{id}") public R<Void> delete(@PathVariable long id,@RequestBody(required=false) Map<String,Object>b){String reason=b==null?null:String.valueOf(b.getOrDefault("reason",""));service.adminDeleteCommunity(id,reason,AuthContext.currentUserId());return R.ok();}
    @PutMapping("/{id}/status") public R<Void> review(@PathVariable long id,@RequestBody Map<String,Object>b){service.review(id,String.valueOf(b.get("status")),b.get("reason")==null?null:String.valueOf(b.get("reason")));return R.ok();}
    @GetMapping("/profile-reviews") public R<?> profileReviews(@RequestParam(required=false)String status,@RequestParam(required=false)String keyword,@RequestParam(defaultValue="1")int page,@RequestParam(defaultValue="20")int size){return R.ok(service.adminProfileReviews(status,keyword,page,size));}
    @PutMapping("/profile-reviews/{id}") public R<Void> reviewProfile(@PathVariable long id,@RequestBody Map<String,Object>b){service.reviewProfileChange(id,String.valueOf(b.get("status")),b.get("reason")==null?null:String.valueOf(b.get("reason")),AuthContext.currentUserId());return R.ok();}
    @GetMapping("/audit-logs") public R<?> auditLogs(@RequestParam String type,@RequestParam(required=false)String keyword,@RequestParam(required=false)String eventType,@RequestParam(defaultValue="1")int page,@RequestParam(defaultValue="20")int size){return R.ok(service.adminCommunityAuditLogs(type,keyword,eventType,page,size));}
    @GetMapping("/topics") public R<?> topics(){return R.ok(service.topics(true));}
    @PostMapping("/topics") public R<?> createTopic(@RequestBody Map<String,Object>b){return R.ok(service.createTopic(String.valueOf(b.getOrDefault("name","")),Integer.parseInt(String.valueOf(b.getOrDefault("sortOrder",0)))));}
    @PutMapping("/topics/{id}") public R<Void> updateTopic(@PathVariable long id,@RequestBody Map<String,Object>b){service.updateTopic(id,String.valueOf(b.getOrDefault("name","")),Integer.parseInt(String.valueOf(b.getOrDefault("sortOrder",0))),Boolean.parseBoolean(String.valueOf(b.getOrDefault("enabled",true))));return R.ok();}
    @DeleteMapping("/topics/{id}") public R<Void> deleteTopic(@PathVariable long id){service.disableTopic(id);return R.ok();}
    @GetMapping("/report-reasons") public R<?> reportReasons(){return R.ok(service.reportReasons(true));}
    @PostMapping("/report-reasons") public R<?> createReportReason(@RequestBody Map<String,Object>b){Object sort=b.containsKey("sortOrder")?b.get("sortOrder"):b.getOrDefault("sort_order",0);return R.ok(service.createReportReason(String.valueOf(b.getOrDefault("code","")),String.valueOf(b.getOrDefault("name","")),Boolean.parseBoolean(String.valueOf(b.getOrDefault("enabled",true))),Integer.parseInt(String.valueOf(sort))));}
    @PutMapping("/report-reasons/{id}") public R<Void> updateReportReason(@PathVariable long id,@RequestBody Map<String,Object>b){Object sort=b.containsKey("sortOrder")?b.get("sortOrder"):b.getOrDefault("sort_order",0);service.updateReportReason(id,String.valueOf(b.getOrDefault("name","")),Boolean.parseBoolean(String.valueOf(b.getOrDefault("enabled",true))),Integer.parseInt(String.valueOf(sort)));return R.ok();}
    @DeleteMapping("/report-reasons/{id}") public R<Void> deleteReportReason(@PathVariable long id){service.deleteReportReason(id);return R.ok();}
    @GetMapping("/member-removal-reasons") public R<?> memberRemovalReasons(){return R.ok(service.memberRemovalReasons(true));}
    @PostMapping("/member-removal-reasons") public R<?> createMemberRemovalReason(@RequestBody Map<String,Object>b){Object sort=b.containsKey("sortOrder")?b.get("sortOrder"):b.getOrDefault("sort_order",0);return R.ok(service.createMemberRemovalReason(String.valueOf(b.getOrDefault("code","")),String.valueOf(b.getOrDefault("name","")),Boolean.parseBoolean(String.valueOf(b.getOrDefault("enabled",true))),Integer.parseInt(String.valueOf(sort))));}
    @PutMapping("/member-removal-reasons/{id}") public R<Void> updateMemberRemovalReason(@PathVariable long id,@RequestBody Map<String,Object>b){Object sort=b.containsKey("sortOrder")?b.get("sortOrder"):b.getOrDefault("sort_order",0);service.updateMemberRemovalReason(id,String.valueOf(b.getOrDefault("name","")),Boolean.parseBoolean(String.valueOf(b.getOrDefault("enabled",true))),Integer.parseInt(String.valueOf(sort)));return R.ok();}
    @DeleteMapping("/member-removal-reasons/{id}") public R<Void> deleteMemberRemovalReason(@PathVariable long id){service.deleteMemberRemovalReason(id);return R.ok();}
    @GetMapping("/config") public R<?> config(){return R.ok(service.config());}
    @PutMapping("/config") public R<Void> config(@RequestBody Map<String,Object>b){service.config(new BigDecimal(String.valueOf(b.get("platformRate"))));return R.ok();}
    @GetMapping("/stats") public R<?> stats(){return R.ok(service.adminStats());}
    @GetMapping("/content") public R<?> content(@RequestParam(required=false)String status,@RequestParam(required=false)String keyword,@RequestParam(defaultValue="1")int page,@RequestParam(defaultValue="20")int size){return R.ok(service.adminPosts(status,keyword,page,size));}
    @PutMapping("/content/{id}") public R<Void> moderate(@PathVariable long id,@RequestBody Map<String,Object>b){service.moderatePost(id,String.valueOf(b.get("status")));return R.ok();}
    @GetMapping("/reports") public R<?> reports(@RequestParam(required=false)String status,@RequestParam(required=false)String keyword,@RequestParam(required=false)String targetType,@RequestParam(defaultValue="1")int page,@RequestParam(defaultValue="20")int size){return R.ok(service.adminReports(status,keyword,targetType,page,size));}
    @PutMapping("/reports/{id}") public R<Void> handleReport(@PathVariable long id,@RequestBody Map<String,Object>b){service.handleReport(id,String.valueOf(b.get("status")),AuthContext.currentUserId());return R.ok();}
    @PutMapping("/reports/{id}/post") public R<Void> moderateReportedPost(@PathVariable long id,@RequestBody Map<String,Object>b){service.moderateReportedPost(id,String.valueOf(b.get("status")),AuthContext.currentUserId());return R.ok();}
}
