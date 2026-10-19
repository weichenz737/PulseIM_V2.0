package com.pulse.api.controller;

import com.pulse.api.service.CallRingtoneService;
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

import java.util.Map;

@RestController
@RequestMapping("/api/admin/call-ringtones")
@RequiredArgsConstructor
public class AdminCallRingtoneController {
    private final CallRingtoneService callRingtoneService;

    @GetMapping
    public R<Map<String, Object>> list(
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "size", defaultValue = "20") int size,
            @RequestParam(value = "keyword", required = false) String keyword) {
        return R.ok(callRingtoneService.adminList(page, size, keyword));
    }

    @GetMapping("/{id}")
    public R<Map<String, Object>> detail(@PathVariable long id) {
        return R.ok(callRingtoneService.adminDetail(id));
    }

    @GetMapping("/{id}/users")
    public R<Map<String, Object>> users(
            @PathVariable long id,
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "size", defaultValue = "50") int size) {
        return R.ok(callRingtoneService.listUsersUsing(id, page, size));
    }

    @PostMapping
    public R<Map<String, Object>> create(@RequestBody Map<String, Object> body) {
        return R.ok(callRingtoneService.create(
                str(body.get("name")),
                str(body.get("url")),
                !Boolean.FALSE.equals(body.get("enabled")),
                Boolean.TRUE.equals(body.get("isDefault")),
                intVal(body.get("sortOrder"), 0)
        ));
    }

    @PutMapping("/{id}")
    public R<Map<String, Object>> update(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return R.ok(callRingtoneService.update(
                id,
                body.containsKey("name") ? str(body.get("name")) : null,
                body.containsKey("url") ? str(body.get("url")) : null,
                body.containsKey("enabled") ? !Boolean.FALSE.equals(body.get("enabled")) : null,
                body.containsKey("isDefault") ? Boolean.TRUE.equals(body.get("isDefault")) : null,
                body.containsKey("sortOrder") ? intVal(body.get("sortOrder"), 0) : null
        ));
    }

    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable long id) {
        callRingtoneService.delete(id);
        return R.ok();
    }

    private static String str(Object v) {
        return v == null ? "" : String.valueOf(v);
    }

    private static int intVal(Object v, int def) {
        if (v instanceof Number n) {
            return n.intValue();
        }
        if (v == null) {
            return def;
        }
        try {
            return Integer.parseInt(String.valueOf(v).trim());
        } catch (Exception e) {
            return def;
        }
    }
}
