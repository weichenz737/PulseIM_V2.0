package com.pulse.api.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

@Data
@Configuration
@ConfigurationProperties(prefix = "pulse.wps.weboffice")
public class WpsWebOfficeProperties {
    /** 是否启用 WPS WebOffice 页内预览。 */
    private boolean enabled;
    /** WPS 开放平台应用 AppId。 */
    private String appId = "";
    /** WPS 开放平台应用 AppSecret，仅服务端使用。 */
    private String appSecret = "";
    /** WPS 回调服务可被公网访问的根地址，例如 https://chat.example.com。 */
    private String publicBaseUrl = "";
    /** 前端 JSSDK 地址；可放在 mobile/public/vendor/wps 下自托管。 */
    private String sdkUrl = "/vendor/wps/web-office-sdk-solution.umd.js";
    /** Pulse 发给 WebOffice 的短期文件令牌密钥，仅服务端使用。 */
    private String tokenSecret = "";
    private long tokenTtlSeconds = 600;
    /** 是否校验 WPS-2 回调签名。生产环境应保持 true。 */
    private boolean verifySignature = true;

    public boolean isConfigured() {
        return enabled
                && StringUtils.hasText(appId)
                && StringUtils.hasText(appSecret)
                && StringUtils.hasText(publicBaseUrl)
                && StringUtils.hasText(tokenSecret);
    }

    public long safeTokenTtlSeconds() {
        return Math.max(60, Math.min(tokenTtlSeconds, 3600));
    }
}
