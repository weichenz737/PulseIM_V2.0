package com.pulse.api.controller;

import com.pulse.api.security.AuthContext;
import com.pulse.api.service.AdminGroupService;
import com.pulse.api.vo.AdminGroupVO;
import com.pulse.common.result.R;
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
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminGroupController {
    private final AdminGroupService adminGroupService;

    @GetMapping("/groups")
    public R<Map<String, Object>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword
    ) {
        return R.ok(adminGroupService.listGroups(page, size, keyword));
    }

    @GetMapping("/groups/{id}")
    public R<AdminGroupVO> detail(@PathVariable Long id) {
        return R.ok(adminGroupService.getGroup(id));
    }

    @PostMapping("/groups")
    public R<AdminGroupVO> create(@RequestBody Map<String, Object> body) {
        String title = body == null || body.get("title") == null ? null : String.valueOf(body.get("title"));
        String notice = body == null || body.get("notice") == null ? null : String.valueOf(body.get("notice"));
        Long ownerId = null;
        Object rawOwner = body == null ? null : body.get("ownerId");
        if (rawOwner != null) {
            try {
                ownerId = Long.valueOf(String.valueOf(rawOwner));
            } catch (Exception ignored) {
                // leave null
            }
        }
        List<Long> memberIds = new ArrayList<>();
        Object rawMembers = body == null ? null : body.get("memberIds");
        if (rawMembers instanceof List<?> list) {
            for (Object o : list) {
                if (o == null) continue;
                try {
                    memberIds.add(Long.valueOf(String.valueOf(o)));
                } catch (Exception ignored) {
                    // skip
                }
            }
        }
        return R.ok(adminGroupService.createGroup(title, ownerId, memberIds, notice));
    }

    @PutMapping("/groups/{id}/owner")
    public R<AdminGroupVO> transferOwner(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body
    ) {
        Long newOwnerId = null;
        Object raw = body == null ? null : body.get("newOwnerId");
        if (raw != null) {
            try {
                newOwnerId = Long.valueOf(String.valueOf(raw));
            } catch (Exception ignored) {
                // leave null
            }
        }
        return R.ok(adminGroupService.transferOwner(id, newOwnerId, AuthContext.currentUserId()));
    }

    @DeleteMapping("/groups/{id}")
    public R<Void> dissolve(@PathVariable Long id) {
        adminGroupService.dissolveGroup(id);
        return R.ok();
    }

    @PostMapping("/groups/batch-delete")
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
        int deleted = adminGroupService.dissolveGroups(ids);
        Map<String, Object> data = new HashMap<>();
        data.put("deleted", deleted);
        return R.ok(data);
    }
}
