package com.pulse.api.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pulse.common.result.R;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

public final class SecurityResponseWriter {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private SecurityResponseWriter() {
    }

    public static void write(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        MAPPER.writeValue(response.getWriter(), R.fail(status, message));
    }
}
