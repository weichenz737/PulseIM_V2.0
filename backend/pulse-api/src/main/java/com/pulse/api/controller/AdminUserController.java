package com.pulse.api.controller;

import com.pulse.api.dto.AdminUserDtos;
import com.pulse.api.security.AuthContext;
import com.pulse.api.service.AdminUserService;
import com.pulse.api.service.SocialService;
import com.pulse.api.service.DefaultFriendService;
import com.pulse.api.service.WalletService;
import com.pulse.api.vo.AdminBlockedUserVO;
import com.pulse.api.vo.AdminFavoriteVO;
import com.pulse.api.vo.AdminFriendDeleteLogVO;
import com.pulse.api.vo.AdminFriendVO;
import com.pulse.api.vo.AdminOwnedGroupVO;
import com.pulse.api.vo.AdminOwnedCommunityVO;
import com.pulse.api.vo.AdminUserVO;
import com.pulse.api.vo.PrivacySettingsVO;
import com.pulse.common.result.R;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
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
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminUserController {
    private final AdminUserService adminUserService;
    private final SocialService socialService;
    private final DefaultFriendService defaultFriendService;
    private final WalletService walletService;

    @GetMapping("/users/default-friend")
    public R<Map<String, Object>> defaultFriend() {
        return R.ok(defaultFriendService.getConfig());
    }

    @PutMapping("/users/default-friend")
    public R<Map<String, Object>> updateDefaultFriend(@RequestBody Map<String, Object> body) {
        return R.ok(defaultFriendService.saveConfig(body));
    }

    @GetMapping("/users")
    public R<Map<String, Object>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Integer status,
            @RequestParam(required = false) Boolean online,
            @RequestParam(required = false) Boolean activeToday,
            @RequestParam(required = false) String createdFrom,
            @RequestParam(required = false) String createdTo,
            @RequestParam(required = false, defaultValue = "online") String sortBy,
            @RequestParam(required = false, defaultValue = "desc") String sortOrder
    ) {
        return R.ok(adminUserService.listUsers(
                page, size, keyword, status, online, activeToday, createdFrom, createdTo, sortBy, sortOrder));
    }

    @GetMapping("/users/{id}")
    public R<AdminUserVO> detail(@PathVariable Long id) {
        return R.ok(adminUserService.getUser(id));
    }

    @GetMapping("/users/{id}/friend-permissions")
    public R<PrivacySettingsVO> friendPermissions(@PathVariable Long id) {
        return R.ok(socialService.getPrivacySettings(id));
    }

    @PutMapping("/users/{id}/friend-permissions")
    public R<PrivacySettingsVO> updateFriendPermissions(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body
    ) {
        return R.ok(socialService.updatePrivacySettings(id, body));
    }

    @PostMapping("/users")
    public R<AdminUserVO> create(@Valid @RequestBody AdminUserDtos.CreateUserReq req) {
        return R.ok(adminUserService.createUser(req));
    }

    @PutMapping("/users/{id}")
    public R<AdminUserVO> update(@PathVariable Long id, @Valid @RequestBody AdminUserDtos.UpdateUserReq req) {
        return R.ok(adminUserService.updateUser(id, req));
    }

    @PutMapping("/users/{id}/status")
    public R<AdminUserVO> updateStatus(
            @PathVariable Long id,
            @Valid @RequestBody AdminUserDtos.UpdateStatusReq req
    ) {
        return R.ok(adminUserService.updateStatus(id, req));
    }

    @PutMapping("/users/{id}/password")
    public R<Void> resetPassword(
            @PathVariable Long id,
            @Valid @RequestBody AdminUserDtos.ResetPasswordReq req
    ) {
        adminUserService.resetPassword(id, req.getPassword());
        return R.ok();
    }

    @PostMapping("/users/{id}/wallet/adjust")
    public R<Map<String, Object>> adjustWallet(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        String direction = body.get("direction") == null ? "" : String.valueOf(body.get("direction"));
        String remark = body.get("remark") == null ? null : String.valueOf(body.get("remark"));
        long amount;
        try {
            amount = Long.parseLong(String.valueOf(body.get("amount")));
        } catch (Exception e) {
            amount = 0L;
        }
        return R.ok(walletService.adminAdjustBalance(
                AuthContext.currentUserId(), id, direction, amount, remark));
    }

    @GetMapping("/users/{id}/owned-groups")
    public R<List<AdminOwnedGroupVO>> ownedGroups(@PathVariable Long id) {
        return R.ok(adminUserService.listOwnedGroups(id));
    }

    /** 该用户拥有的社区圈子，删除用户前由后台明确确认是否一并删除。 */
    @GetMapping("/users/{id}/owned-communities")
    public R<List<AdminOwnedCommunityVO>> ownedCommunities(@PathVariable Long id) {
        return R.ok(adminUserService.listOwnedCommunities(id));
    }

    /** 该用户拉黑的人（黑名单） */
    @GetMapping("/users/{id}/blocked-users")
    public R<List<AdminBlockedUserVO>> blockedUsers(@PathVariable Long id) {
        return R.ok(adminUserService.listBlockedUsers(id));
    }

    /** 好友列表（含添加方式） */
    @GetMapping("/users/{id}/friends")
    public R<List<AdminFriendVO>> friends(@PathVariable Long id) {
        return R.ok(adminUserService.listFriends(id));
    }

    /** 删除好友记录（含因拉黑解除） */
    @GetMapping("/users/{id}/friend-delete-logs")
    public R<List<AdminFriendDeleteLogVO>> friendDeleteLogs(@PathVariable Long id) {
        return R.ok(adminUserService.listFriendDeleteLogs(id));
    }

    /** 用户收藏 */
    @GetMapping("/users/{id}/favorites")
    public R<List<AdminFavoriteVO>> favorites(@PathVariable Long id) {
        return R.ok(adminUserService.listFavorites(id));
    }

    @DeleteMapping("/users/{id}")
    public R<Void> delete(
            @PathVariable Long id,
            @RequestBody(required = false) AdminUserDtos.DeleteUserReq body
    ) {
        List<AdminUserDtos.OwnerTransfer> transfers = body == null ? null : body.getTransfers();
        Boolean deleteOwnedCommunities = body == null ? null : body.getDeleteOwnedCommunities();
        adminUserService.deleteUser(id, transfers, AuthContext.currentUserId(), deleteOwnedCommunities);
        return R.ok();
    }

    @PostMapping("/users/batch-delete")
    public R<Map<String, Object>> batchDelete(@RequestBody Map<String, Object> body) {
        List<Long> ids = new ArrayList<>();
        Object raw = body == null ? null : body.get("ids");
        if (raw instanceof List<?> list) {
            for (Object o : list) {
                if (o == null) continue;
                try {
                    ids.add(Long.valueOf(String.valueOf(o)));
                } catch (Exception ignored) {
                    // skip
                }
            }
        }
        int deleted = adminUserService.deleteUsers(ids);
        return R.ok(Map.of("deleted", deleted));
    }

    @GetMapping("/dashboard/stats")
    public R<Map<String, Object>> stats() {
        return R.ok(adminUserService.dashboardStats());
    }
}
