package com.pulse.api;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
@MapperScan("com.pulse.api.mapper")
public class PulseApiApplication {
    public static void main(String[] args) {
        SpringApplication.run(PulseApiApplication.class, args);
    }
}
