package com.pulse.api.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

@Data
@Configuration
@ConfigurationProperties(prefix = "pulse.webrtc")
public class WebrtcProperties {
    /** STUN 列表 */
    private List<String> stunUrls = new ArrayList<>(List.of(
            "stun:stun.l.google.com:19302",
            "stun:stun1.l.google.com:19302"
    ));

    /**
     * TURN URL，支持逗号分隔（生产环境变量 TURN_URLS）。
     * 例：turn:1.2.3.4:3478?transport=udp,turn:1.2.3.4:3478?transport=tcp
     */
    private String turnUrls = "";

    private String turnUsername = "";
    private String turnCredential = "";

    /** 解析后的 TURN URL 列表（去空） */
    public List<String> resolveTurnUrls() {
        if (!StringUtils.hasText(turnUrls)) {
            return List.of();
        }
        return Arrays.stream(turnUrls.split(","))
                .map(String::trim)
                .filter(StringUtils::hasText)
                .collect(Collectors.toList());
    }
}
