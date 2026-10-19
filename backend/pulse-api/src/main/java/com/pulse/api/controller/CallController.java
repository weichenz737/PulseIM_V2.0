package com.pulse.api.controller;

import com.pulse.api.security.AuthContext;
import com.pulse.api.config.WebrtcProperties;
import com.pulse.api.service.CallLogService;
import com.pulse.common.result.R;
import lombok.RequiredArgsConstructor;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.nio.charset.StandardCharsets;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

@RestController
@RequestMapping("/api/v1/calls")
@RequiredArgsConstructor
public class CallController {
    private static final long TURN_TTL_SECONDS = 3600L;

    private final WebrtcProperties webrtcProperties;
    private final CallLogService callLogService;

    @GetMapping("/ice-servers")
    public R<List<Map<String, Object>>> iceServers() {
        List<Map<String, Object>> list = new ArrayList<>();
        List<String> stuns = webrtcProperties.getStunUrls();
        if (stuns != null) {
            for (String url : stuns) {
                if (!StringUtils.hasText(url)) continue;
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("urls", url.trim());
                list.add(m);
            }
        }
        List<String> turnList = webrtcProperties.resolveTurnUrls();
        if (!turnList.isEmpty()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("urls", turnList.size() == 1 ? turnList.get(0) : turnList);
            if (StringUtils.hasText(webrtcProperties.getTurnCredential())) {
                // 短时效 TURN 临时凭据（coturn REST API 模式）：
                // username = <过期时间戳>:<userId>，credential = base64(HMAC-SHA1(secret, username))
                // 避免把静态密钥下发给客户端，凭据 1 小时后自动失效
                long expiry = (System.currentTimeMillis() / 1000) + TURN_TTL_SECONDS;
                String username = expiry + ":" + AuthContext.currentUserId();
                m.put("username", username);
                m.put("credential", turnRestCredential(username, webrtcProperties.getTurnCredential()));
            }
            list.add(m);
        }
        if (list.isEmpty()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("urls", "stun:stun.l.google.com:19302");
            list.add(m);
        }
        return R.ok(list);
    }

    private static String turnRestCredential(String username, String secret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA1"));
            return Base64.getEncoder().encodeToString(mac.doFinal(username.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("generate turn credential failed", e);
        }
    }

    @PostMapping("/group-log")
    public R<Void> groupLog(@RequestBody Map<String, Object> body) {
        callLogService.recordGroupCall(AuthContext.currentUserId(), body);
        return R.ok();
    }
}
