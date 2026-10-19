package com.pulse.api.controller;

import com.pulse.api.service.AdminMomentService;
import com.pulse.api.vo.AdminMomentVO;
import com.pulse.common.result.R;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
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
public class AdminMomentController {
    private final AdminMomentService adminMomentService;

    @GetMapping("/moments")
    public R<Map<String, Object>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String status
    ) {
        return R.ok(adminMomentService.listMoments(page, size, keyword, status));
    }

    @GetMapping("/moments/{id}")
    public R<AdminMomentVO> detail(@PathVariable Long id) {
        return R.ok(adminMomentService.getMoment(id));
    }

    @DeleteMapping("/moments/{id}")
    public R<Void> delete(@PathVariable Long id) {
        adminMomentService.deleteMoment(id);
        return R.ok();
    }

    @PostMapping("/moments/batch-delete")
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
        int deleted = adminMomentService.deleteMoments(ids);
        Map<String, Object> data = new HashMap<>();
        data.put("deleted", deleted);
        return R.ok(data);
    }
}
