package com.pulse.api.util;

import org.springframework.util.StringUtils;

/**
 * 将浏览器 User-Agent 转成后台可读的设备摘要。
 */
public final class UserAgentSummarizer {
    private UserAgentSummarizer() {}

    public static String summarize(String ua) {
        if (!StringUtils.hasText(ua)) {
            return "未知设备";
        }
        String raw = ua.trim();
        String os = detectOs(raw);
        String browser = detectBrowser(raw);
        String device = detectDevice(raw, os);
        if ("未知".equals(os) && "未知".equals(browser)) {
            return truncate(raw, 80);
        }
        StringBuilder sb = new StringBuilder();
        if (!"未知".equals(device) && !device.equals(os)) {
            sb.append(device).append(" · ");
        }
        sb.append(os);
        if (!"未知".equals(browser)) {
            sb.append(" · ").append(browser);
        }
        return sb.toString();
    }

    private static String detectOs(String ua) {
        String lower = ua.toLowerCase();
        if (lower.contains("android")) {
            return extractVersionLabel(ua, "(?i)Android[\\s/]*([\\d.]+)", "Android");
        }
        if (lower.contains("iphone") || lower.contains("ipod")) {
            return extractVersionLabel(ua, "(?i)OS[\\s_]*([\\d_]+)", "iOS").replace('_', '.');
        }
        if (lower.contains("ipad")) {
            return extractVersionLabel(ua, "(?i)OS[\\s_]*([\\d_]+)", "iPadOS").replace('_', '.');
        }
        if (lower.contains("windows nt 10") || lower.contains("windows nt 11")) return "Windows 10/11";
        if (lower.contains("windows")) return "Windows";
        if (lower.contains("mac os x") || lower.contains("macintosh")) {
            return extractVersionLabel(ua, "(?i)Mac OS X[\\s_]*([\\d_]+)", "macOS").replace('_', '.');
        }
        if (lower.contains("linux")) return "Linux";
        return "未知";
    }

    private static String detectBrowser(String ua) {
        String lower = ua.toLowerCase();
        if (lower.contains("micromessenger")) return "微信内置浏览器";
        if (lower.contains("edg/") || lower.contains("edgios") || lower.contains("edga")) return "Edge";
        if (lower.contains("firefox") || lower.contains("fxios")) return "Firefox";
        if (lower.contains("crios") || (lower.contains("chrome") && !lower.contains("edg"))) return "Chrome";
        if (lower.contains("safari") && !lower.contains("chrome") && !lower.contains("crios")) return "Safari";
        if (lower.contains("opera") || lower.contains("opr/")) return "Opera";
        return "未知";
    }

    private static String detectDevice(String ua, String os) {
        String lower = ua.toLowerCase();
        if (lower.contains("iphone")) return "iPhone";
        if (lower.contains("ipad")) return "iPad";
        if (lower.contains("ipod")) return "iPod";
        if (lower.contains("android")) {
            if (lower.contains("mobile")) return "安卓手机";
            return "安卓设备";
        }
        if (os.startsWith("Windows") || os.startsWith("macOS") || os.equals("Linux")) {
            return "电脑";
        }
        return "未知";
    }

    private static String extractVersionLabel(String ua, String regex, String label) {
        try {
            java.util.regex.Matcher m = java.util.regex.Pattern.compile(regex).matcher(ua);
            if (m.find()) {
                String ver = m.group(1);
                if (StringUtils.hasText(ver)) {
                    return label + " " + ver;
                }
            }
        } catch (Exception ignored) {
            // ignore
        }
        return label;
    }

    private static String truncate(String value, int max) {
        if (value.length() <= max) return value;
        return value.substring(0, max);
    }
}
