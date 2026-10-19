package com.pulse.api.controller;

import com.pulse.api.service.ContainerConfigService;
import com.pulse.common.result.R;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** Public, secret-free bootstrap endpoint used by packaged clients. */
@RestController
@RequestMapping("/api/v1/config/server-origin")
@RequiredArgsConstructor
public class ServerOriginController {
    private final ContainerConfigService containerConfigService;

    @GetMapping
    public R<Map<String, Object>> get(HttpServletRequest request) {
        return R.ok(containerConfigService.getDiscoveryConfig(currentOrigin(request)));
    }

    private static String currentOrigin(HttpServletRequest request) {
        String forwardedProto = firstHeader(request, "X-Forwarded-Proto");
        String forwardedHost = firstHeader(request, "X-Forwarded-Host");
        String scheme = forwardedProto.isEmpty() ? request.getScheme() : forwardedProto;
        String host = forwardedHost.isEmpty() ? request.getServerName() : forwardedHost;
        int port = request.getServerPort();
        boolean standardPort = ("http".equalsIgnoreCase(scheme) && port == 80)
                || ("https".equalsIgnoreCase(scheme) && port == 443);
        if (forwardedHost.isEmpty() && !standardPort && port > 0) {
            host = host + ":" + port;
        }
        return scheme + "://" + host;
    }

    private static String firstHeader(HttpServletRequest request, String name) {
        String value = request.getHeader(name);
        if (value == null) return "";
        int comma = value.indexOf(',');
        return (comma >= 0 ? value.substring(0, comma) : value).trim();
    }
}
