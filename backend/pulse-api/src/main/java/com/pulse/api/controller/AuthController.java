package com.pulse.api.controller;

import com.pulse.api.dto.AuthDtos;
import com.pulse.api.config.JwtProperties;
import com.pulse.api.security.AuthContext;
import com.pulse.api.security.AuthCookieUtil;
import com.pulse.api.service.AuthService;
import com.pulse.api.service.DesktopQrLoginService;
import com.pulse.api.vo.LoginVO;
import com.pulse.common.result.R;
import jakarta.validation.Valid;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {
    private final AuthService authService;
    private final DesktopQrLoginService desktopQrLoginService;
    private final JwtProperties jwtProperties;

    @PostMapping("/sms/send")
    public R<Map<String, String>> sendSms(@Valid @RequestBody AuthDtos.SendSmsReq req) {
        authService.sendSms(req);
        return R.ok(Map.of("message", "验证码已发送", "devHint", "开发环境验证码固定为 1234"));
    }

    @PostMapping("/login")
    public R<LoginVO> login(@Valid @RequestBody AuthDtos.LoginPasswordReq req,
                            HttpServletRequest request, HttpServletResponse response) {
        LoginVO vo = authService.loginByPassword(req);
        AuthCookieUtil.issue(request, response, vo.getToken(), jwtProperties.getExpireMs() / 1000);
        return R.ok(vo);
    }

    @PostMapping("/login/sms")
    public R<LoginVO> loginSms(@Valid @RequestBody AuthDtos.LoginSmsReq req,
                               HttpServletRequest request, HttpServletResponse response) {
        LoginVO vo = authService.loginBySms(req);
        AuthCookieUtil.issue(request, response, vo.getToken(), jwtProperties.getExpireMs() / 1000);
        return R.ok(vo);
    }

    @PostMapping("/qr/start")
    public R<Map<String, Object>> startDesktopQrLogin(@RequestBody(required = false) Map<String, String> request) {
        return R.ok(desktopQrLoginService.start(request));
    }

    @GetMapping("/qr/status")
    public R<Map<String, Object>> desktopQrLoginStatus(@RequestParam String ticket) {
        return R.ok(desktopQrLoginService.status(ticket));
    }

    @PostMapping("/qr/confirm")
    public R<Map<String, Object>> confirmDesktopQrLogin(@RequestBody Map<String, String> request) {
        return R.ok(desktopQrLoginService.confirm(request == null ? null : request.get("ticket")));
    }

    @PostMapping("/register")
    public R<LoginVO> register(@Valid @RequestBody AuthDtos.RegisterReq req,
                               HttpServletRequest request, HttpServletResponse response) {
        LoginVO vo = authService.register(req);
        AuthCookieUtil.issue(request, response, vo.getToken(), jwtProperties.getExpireMs() / 1000);
        return R.ok(vo);
    }

    /**
     * 使用仍然有效的访问令牌滚动续期，不改变登录态和鉴权版本。
     */
    @PostMapping("/refresh")
    public R<LoginVO> refresh(HttpServletRequest request, HttpServletResponse response) {
        LoginVO vo = authService.refreshToken(AuthContext.currentUserId(), AuthContext.currentDeviceId());
        AuthCookieUtil.issue(request, response, vo.getToken(), jwtProperties.getExpireMs() / 1000);
        return R.ok(vo);
    }

    /** 服务端登出：吊销当前设备令牌并清除登录 Cookie */
    @PostMapping("/logout")
    public R<Void> logout(HttpServletRequest request, HttpServletResponse response) {
        authService.logout(AuthContext.currentUserId(), AuthContext.currentDeviceId());
        AuthCookieUtil.clear(request, response);
        return R.ok();
    }

    @PostMapping("/password/reset")
    public R<Void> resetPassword(@Valid @RequestBody AuthDtos.ResetPasswordReq req) {
        authService.resetPassword(req);
        return R.ok();
    }
}
