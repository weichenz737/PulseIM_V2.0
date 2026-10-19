package com.pulse.api.util;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class UserAgentSummarizerTest {
    @Test
    void recognizesDesktopChrome() {
        String result = UserAgentSummarizer.summarize(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                        + "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36");

        assertTrue(result.contains("Windows 10/11"));
        assertTrue(result.contains("Chrome"));
    }

    @Test
    void recognizesIphoneSafariAndVersion() {
        String result = UserAgentSummarizer.summarize(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) "
                        + "AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1");

        assertTrue(result.contains("iPhone"));
        assertTrue(result.contains("iOS 17.5"));
        assertTrue(result.contains("Safari"));
    }

    @Test
    void truncatesUnknownUserAgent() {
        String unknown = "custom-client/" + "x".repeat(100);
        assertEquals(80, UserAgentSummarizer.summarize(unknown).length());
    }
}
