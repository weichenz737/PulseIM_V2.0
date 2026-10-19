package com.pulse.api.controller;

import com.pulse.api.dto.AdminAccountDtos;
import com.pulse.api.security.AuthContext;
import com.pulse.api.service.AdminAccountService;
import com.pulse.api.support.AdminPermissionCodes;
import com.pulse.api.vo.AdminAccountVO;
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

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminAccountController {
    private final AdminAccountService adminAccountService;

    @GetMapping("/permissions")
    public R<List<Map<String, String>>> permissions() {
        return R.ok(AdminPermissionCodes.catalog());
    }

    @GetMapping("/admins")
    public R<Map<String, Object>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Integer status
    ) {
        return R.ok(adminAccountService.list(page, size, keyword, status));
    }

    @GetMapping("/admins/{id}")
    public R<AdminAccountVO> detail(@PathVariable Long id) {
        return R.ok(adminAccountService.get(id));
    }

    @PostMapping("/admins")
    public R<AdminAccountVO> create(@Valid @RequestBody AdminAccountDtos.CreateReq req) {
        return R.ok(adminAccountService.create(AuthContext.currentUserId(), req));
    }

    @PutMapping("/admins/{id}")
    public R<AdminAccountVO> update(@PathVariable Long id, @Valid @RequestBody AdminAccountDtos.UpdateReq req) {
        return R.ok(adminAccountService.update(AuthContext.currentUserId(), id, req));
    }

    @PutMapping("/admins/{id}/password")
    public R<Void> resetPassword(
            @PathVariable Long id,
            @Valid @RequestBody AdminAccountDtos.ResetPasswordReq req
    ) {
        adminAccountService.resetPassword(AuthContext.currentUserId(), id, req.getPassword());
        return R.ok();
    }

    @DeleteMapping("/admins/{id}")
    public R<Void> delete(@PathVariable Long id) {
        adminAccountService.delete(AuthContext.currentUserId(), id);
        return R.ok();
    }
}
