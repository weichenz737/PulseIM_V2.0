package com.pulse.api.config;

import com.pulse.api.service.FileService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.util.concurrent.CompletableFuture;

/**
 * API 启动后后台预热头像缩略图，避免管理端用户列表首次打开时批量现算变慢。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AvatarThumbWarmer implements ApplicationRunner {
    private final FileService fileService;

    @Override
    public void run(ApplicationArguments args) {
        CompletableFuture.runAsync(() -> {
            try {
                Thread.sleep(3_000L);
                int n = fileService.warmAvatarThumbs(800);
                log.info("Startup avatar thumb warm finished: {}", n);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
            } catch (Exception e) {
                log.warn("Startup avatar thumb warm failed: {}", e.toString());
            }
        });
    }
}
