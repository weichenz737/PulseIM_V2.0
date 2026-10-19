package com.pulse.api.controller;

import com.pulse.api.service.AdminUserService;
import com.pulse.api.vo.AdminFriendVO;
import com.pulse.common.result.R;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 用户关系相关全局列表：好友 / 黑名单 / 收藏 / 删友记录。
 */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminUserRelationController {
    private final AdminUserService adminUserService;

    @GetMapping("/user-friends")
    public R<Map<String, Object>> friends(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long userId
    ) {
        return R.ok(adminUserService.listAllFriends(page, size, keyword, userId));
    }

    @PostMapping("/user-friends")
    public R<AdminFriendVO> createFriend(@RequestBody Map<String, Object> body) {
        Long userId = toLong(body == null ? null : body.get("userId"));
        Long friendId = toLong(body == null ? null : body.get("friendId"));
        String remark = body == null || body.get("remark") == null ? null : String.valueOf(body.get("remark"));
        return R.ok(adminUserService.createFriendship(userId, friendId, remark));
    }

    @GetMapping("/user-blocks")
    public R<Map<String, Object>> blocks(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long userId
    ) {
        return R.ok(adminUserService.listAllBlocks(page, size, keyword, userId));
    }

    @GetMapping("/user-favorites")
    public R<Map<String, Object>> favorites(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long userId,
            @RequestParam(required = false) Integer msgType
    ) {
        return R.ok(adminUserService.listAllFavorites(page, size, keyword, userId, msgType));
    }

    @GetMapping("/user-friend-delete-logs")
    public R<Map<String, Object>> friendDeleteLogs(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long userId,
            @RequestParam(required = false) String reason
    ) {
        return R.ok(adminUserService.listAllFriendDeleteLogs(page, size, keyword, userId, reason));
    }

    private static Long toLong(Object raw) {
        if (raw == null) return null;
        try {
            long n = Long.parseLong(String.valueOf(raw).trim());
            return n > 0 ? n : null;
        } catch (Exception e) {
            return null;
        }
    }
}
