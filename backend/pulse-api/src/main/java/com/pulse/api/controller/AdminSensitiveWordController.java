package com.pulse.api.controller;

import com.pulse.api.service.SensitiveWordService;
import com.pulse.common.result.R;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/admin/sensitive-words")
@RequiredArgsConstructor
public class AdminSensitiveWordController {
    private final SensitiveWordService sensitiveWordService;

    @GetMapping
    public R<Map<String, Object>> list(@RequestParam(defaultValue = "1") int page,
                                       @RequestParam(defaultValue = "20") int size,
                                       @RequestParam(required = false) String keyword,
                                       @RequestParam(required = false) Boolean enabled) {
        return R.ok(sensitiveWordService.adminList(page, size, keyword, enabled));
    }

    @PostMapping
    public R<Map<String, Object>> create(@RequestBody WordReq req) {
        return R.ok(sensitiveWordService.save(null, req.word, req.enabled));
    }

    @PutMapping("/{id}")
    public R<Map<String, Object>> update(@PathVariable Long id, @RequestBody WordReq req) {
        return R.ok(sensitiveWordService.save(id, req.word, req.enabled));
    }

    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable Long id) {
        sensitiveWordService.delete(id);
        return R.ok();
    }

    @PostMapping("/batch")
    public R<Map<String, Object>> batchImport(@RequestBody BatchReq req) {
        return R.ok(sensitiveWordService.batchImport(req.text, req.enabled));
    }

    @Data
    public static class WordReq {
        private String word;
        private Boolean enabled;
    }

    @Data
    public static class BatchReq {
        private String text;
        private Boolean enabled;
    }
}
