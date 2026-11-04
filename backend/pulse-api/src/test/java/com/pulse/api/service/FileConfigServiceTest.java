package com.pulse.api.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class FileConfigServiceTest {
    private final JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    private final FileConfigService service = new FileConfigService(jdbcTemplate);

    @BeforeEach
    void configureLimits() {
        when(jdbcTemplate.queryForList(anyString())).thenReturn(List.of(Map.of(
                "max_size_mb", 30,
                "image_max_size_mb", 2,
                "video_max_size_mb", 20,
                "file_max_size_mb", 30,
                "allowed_extensions", ""
        )));
    }

    @Test
    void appliesIndependentLimitsByMediaType() {
        assertThatThrownBy(() -> service.assertFileAllowed("photo.jpg", "image/jpeg", 3L * 1024 * 1024))
                .hasMessageContaining("图片不能超过 2MB");
        assertThatThrownBy(() -> service.assertFileAllowed("movie.mp4", "video/mp4", 21L * 1024 * 1024))
                .hasMessageContaining("视频不能超过 20MB");
        assertThatThrownBy(() -> service.assertFileAllowed("report.pdf", "application/pdf", 31L * 1024 * 1024))
                .hasMessageContaining("文件不能超过 30MB");
        assertThatCode(() -> service.assertFileAllowed("photo.jpg", "image/jpeg", 2L * 1024 * 1024))
                .doesNotThrowAnyException();
    }
}
