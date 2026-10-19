package com.pulse.api.controller;

import com.pulse.api.dto.AuthDtos;
import com.pulse.api.config.JwtProperties;
import com.pulse.api.security.AuthContext;
import com.pulse.api.security.AuthCookieUtil;
import com.pulse.api.service.AuthService;
import com.pulse.api.vo.LoginVO;
import com.pulse.common.result.R;
import jakarta.validation.Valid;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {
    private final AuthService authService;
    private final JwtProperties jwtProperties;

    @PostMapping("/auth/login")
    public R<LoginVO> login(@Valid @RequestBody AuthDtos.AdminLoginReq req,
                            HttpServletRequest request, HttpServletResponse response) {
        LoginVO vo = authService.adminLogin(req);
        AuthCookieUtil.issue(request, response, vo.getToken(), jwtProperties.getExpireMs() / 1000);
        return R.ok(vo);
    }

    @GetMapping("/profile")
    public R<LoginVO> profile(HttpServletRequest request, HttpServletResponse response) {
        String authorization = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (StringUtils.hasText(authorization)
                && authorization.startsWith("Bearer ")) {
            AuthCookieUtil.issue(
                    request,
                    response,
                    authorization.substring("Bearer ".length()).trim(),
                    jwtProperties.getExpireMs() / 1000
            );
        }
        return R.ok(authService.getAdminProfile(AuthContext.currentUserId()));
    }

    @PutMapping("/profile")
    public R<LoginVO> updateProfile(@Valid @RequestBody AuthDtos.AdminUpdateProfileReq req) {
        return R.ok(authService.updateAdminProfile(
                AuthContext.currentUserId(),
                req.getNickname(),
                req.getAvatarUrl()
        ));
    }

    @PutMapping("/profile/password")
    public R<Void> changePassword(@Valid @RequestBody AuthDtos.AdminChangePasswordReq req) {
        authService.changeAdminPassword(
                AuthContext.currentUserId(),
                req.getOldPassword(),
                req.getNewPassword()
        );
        return R.ok();
    }

    @GetMapping("/dashboard/ping")
    public R<Map<String, Object>> ping() {
        return R.ok(Map.of("ok", true, "service", "pulse-admin-api"));
    }
}
