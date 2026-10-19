package com.pulse.api.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Data
@Configuration
@ConfigurationProperties(prefix = "pulse.sms")
public class SmsProperties {
    private String devFixedCode = "1234";
    private long expireSeconds = 300;
}
