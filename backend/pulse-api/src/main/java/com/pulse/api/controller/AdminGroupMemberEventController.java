package com.pulse.api.controller;

import com.pulse.api.service.GroupMemberEventService;
import com.pulse.common.result.R;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
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
public class AdminGroupMemberEventController {
    private final GroupMemberEventService groupMemberEventService;

    @GetMapping("/group-member-events")
    public R<Map<String, Object>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long conversationId,
            @RequestParam(required = false) String eventType
    ) {
        return R.ok(groupMemberEventService.listEvents(page, size, keyword, conversationId, eventType));
    }

    @PostMapping("/group-member-events/batch-delete")
    public R<Map<String, Object>> batchDelete(@RequestBody Map<String, Object> body) {
        int deleted = groupMemberEventService.deleteByIds(parseIds(body));
        Map<String, Object> data = new HashMap<>();
        data.put("deleted", deleted);
        return R.ok(data);
    }

    private static List<Long> parseIds(Map<String, Object> body) {
        List<Long> ids = new ArrayList<>();
        if (body == null || !(body.get("ids") instanceof List<?> list)) {
            return ids;
        }
        for (Object o : list) {
            if (o == null) continue;
            try {
                ids.add(Long.valueOf(String.valueOf(o)));
            } catch (Exception ignored) {
                // skip
            }
        }
        return ids;
    }
}
