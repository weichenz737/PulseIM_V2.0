package com.pulse.api.service;

import com.pulse.api.config.WpsWebOfficeProperties;
import com.pulse.common.exception.BizException;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.io.IOException;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Pattern;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

@Service
@RequiredArgsConstructor
public class WpsWebOfficeService {
    private static final Pattern FILE_ID = Pattern.compile("[A-Za-z0-9]{32}");
    private static final String CALLBACK_PREFIX = "/api/v1/wps/weboffice";

    private final FileService fileService;
    private final WpsWebOfficeProperties properties;

    public Map<String, Object> preparePreview(Long userId, String url, String name, String contentType) {
        requireConfigured();
        String storedName = extractRawFilename(url);
        Path source = fileService.resolveRawPath(storedName);
        String fileId = fileService.webOfficeFileId(storedName);
        String token = issueToken(userId, fileId);
        String displayName = StringUtils.hasText(name) ? name.trim() : source.getFileName().toString();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("appId", properties.getAppId());
        result.put("fileId", fileId);
        result.put("officeType", officeType(source.getFileName().toString(), contentType));
        result.put("token", token);
        result.put("tokenTimeoutMs", properties.safeTokenTtlSeconds() * 1000L);
        result.put("sdkUrl", properties.getSdkUrl());
        result.put("fileName", displayName);
        result.put("callbackBaseUrl", trimTrailingSlash(properties.getPublicBaseUrl()) + CALLBACK_PREFIX);
        return result;
    }

    public Map<String, Object> refreshPreview(Long userId, String fileId) {
        requireConfigured();
        fileService.resolveWebOfficePath(fileId);
        return Map.of(
                "token", issueToken(userId, fileId),
                "timeoutMs", properties.safeTokenTtlSeconds() * 1000L
        );
    }

    public Map<String, Object> fileInfo(String fileId, String token, String userQuery) {
        Long userId = authorizeToken(token, fileId);
        Path path = fileService.resolveWebOfficePath(fileId);
        long now = Instant.now().getEpochSecond();
        long modified = lastModifiedSeconds(path, now);
        String name = queryValue(userQuery, "pulse_filename");
        if (!StringUtils.hasText(name)) name = path.getFileName().toString();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", fileId);
        data.put("name", name);
        data.put("version", 1);
        data.put("size", FilesSize(path));
        data.put("create_time", modified);
        data.put("modify_time", modified);
        data.put("creator_id", String.valueOf(userId));
        data.put("modifier_id", String.valueOf(userId));
        return success(data);
    }

    public Map<String, Object> filePermission(String fileId, String token) {
        Long userId = authorizeToken(token, fileId);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("user_id", String.valueOf(userId));
        data.put("read", 1);
        data.put("update", 0);
        data.put("download", 1);
        data.put("rename", 0);
        data.put("history", 0);
        data.put("copy", 1);
        data.put("print", 0);
        data.put("saveas", 0);
        data.put("comment", 0);
        return success(data);
    }

    public Map<String, Object> fileDownload(String fileId, String token) {
        authorizeToken(token, fileId);
        Path path = fileService.resolveWebOfficePath(fileId);
        Map<String, Object> data = new LinkedHashMap<>();
        String base = trimTrailingSlash(properties.getPublicBaseUrl());
        String url = base + CALLBACK_PREFIX + "/files/" + fileId
                + "?token=" + URLEncoder.encode(token, StandardCharsets.UTF_8);
        data.put("url", url);
        data.put("digest_type", "sha1");
        data.put("digest", sha1Hex(path));
        return success(data);
    }

    public Path resolveDownload(String fileId, String token) {
        authorizeToken(token, fileId);
        return fileService.resolveWebOfficePath(fileId);
    }

    public void verifyCallback(HttpServletRequest request) {
        requireConfigured();
        if (!properties.isVerifySignature()) return;
        String appId = request.getHeader("X-App-Id");
        String authorization = request.getHeader("Authorization");
        String date = request.getHeader("Date");
        if (!Objects.equals(properties.getAppId(), appId)
                || !StringUtils.hasText(authorization)
                || !StringUtils.hasText(date)) {
            throw new BizException("WPS 回调鉴权失败");
        }
        String prefix = "WPS-2:" + properties.getAppId() + ":";
        if (!authorization.startsWith(prefix)) throw new BizException("WPS 回调签名格式错误");
        String contentType = request.getHeader("Content-Type");
        if (contentType == null) contentType = "";
        String contentMd5 = request.getHeader("Content-Md5");
        if (!StringUtils.hasText(contentMd5)) {
            String uri = request.getRequestURI();
            if (StringUtils.hasText(request.getQueryString())) uri += "?" + request.getQueryString();
            contentMd5 = md5Hex(uri.getBytes(StandardCharsets.UTF_8));
        }
        String expected = sha1Hex((properties.getAppSecret() + contentMd5 + contentType + date)
                .getBytes(StandardCharsets.UTF_8));
        String actual = authorization.substring(prefix.length());
        if (!MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), actual.getBytes(StandardCharsets.UTF_8))) {
            throw new BizException("WPS 回调签名无效");
        }
    }

    public Map<String, Object> success(Map<String, Object> data) {
        return Map.of("code", 0, "message", "", "data", data);
    }

    private void requireConfigured() {
        if (!properties.isConfigured()) {
            throw new BizException("WPS WebOffice 尚未配置 AppId、AppSecret 或公网回调地址");
        }
    }

    private String issueToken(Long userId, String fileId) {
        long expiresAt = Instant.now().getEpochSecond() + properties.safeTokenTtlSeconds();
        String payload = String.valueOf(userId == null ? 0 : userId) + "." + fileId + "." + expiresAt;
        String encoded = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(payload.getBytes(StandardCharsets.UTF_8));
        return encoded + "." + hmac(encoded);
    }

    private Long authorizeToken(String token, String fileId) {
        if (!StringUtils.hasText(token) || !FILE_ID.matcher(fileId == null ? "" : fileId).matches()) {
            throw new BizException("WPS 文件令牌无效");
        }
        String[] parts = token.split("\\.", 2);
        if (parts.length != 2 || !MessageDigest.isEqual(
                hmac(parts[0]).getBytes(StandardCharsets.UTF_8), parts[1].getBytes(StandardCharsets.UTF_8))) {
            throw new BizException("WPS 文件令牌无效");
        }
        try {
            String payload = new String(Base64.getUrlDecoder().decode(parts[0]), StandardCharsets.UTF_8);
            String[] values = payload.split("\\.", 3);
            long userId = Long.parseLong(values[0]);
            long expiresAt = Long.parseLong(values[2]);
            if (!fileId.equals(values[1]) || expiresAt < Instant.now().getEpochSecond()) {
                throw new BizException("WPS 文件令牌已过期");
            }
            return userId;
        } catch (BizException e) {
            throw e;
        } catch (Exception e) {
            throw new BizException("WPS 文件令牌无效");
        }
    }

    private String hmac(String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(properties.getTokenSecret().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(
                    mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("WPS token signer unavailable", e);
        }
    }

    private static String extractRawFilename(String url) {
        String value = StringUtils.hasText(url) ? url.trim() : "";
        int query = value.indexOf('?');
        if (query >= 0) value = value.substring(0, query);
        int marker = value.lastIndexOf("/files/raw/");
        if (marker < 0) throw new BizException("无效的文件地址");
        String name = value.substring(marker + "/files/raw/".length());
        if (!StringUtils.hasText(name) || name.contains("/") || name.contains("..")) {
            throw new BizException("无效的文件地址");
        }
        return URLDecoder.decode(name, StandardCharsets.UTF_8);
    }

    private static String officeType(String name, String contentType) {
        String lower = String.valueOf(name).toLowerCase(Locale.ROOT);
        int dot = lower.lastIndexOf('.');
        String ext = dot >= 0 ? lower.substring(dot + 1) : "";
        if (SetOf.WORD.contains(ext) || String.valueOf(contentType).contains("word")) return "w";
        if (SetOf.SHEET.contains(ext) || String.valueOf(contentType).contains("excel")
                || String.valueOf(contentType).contains("spreadsheet")) return "s";
        if (SetOf.PPT.contains(ext) || String.valueOf(contentType).contains("powerpoint")
                || String.valueOf(contentType).contains("presentation")) return "p";
        if ("pdf".equals(ext) || "application/pdf".equalsIgnoreCase(contentType)) return "f";
        throw new BizException("WPS WebOffice 暂不支持该文件格式");
    }

    private static long lastModifiedSeconds(Path path, long fallback) {
        try {
            return Files.getLastModifiedTime(path).toMillis() / 1000L;
        } catch (IOException e) {
            return fallback;
        }
    }

    private static long FilesSize(Path path) {
        try {
            return Files.size(path);
        } catch (IOException e) {
            throw new BizException("读取文件大小失败");
        }
    }

    private static String sha1Hex(Path path) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-1");
            try (var in = Files.newInputStream(path)) {
                byte[] buffer = new byte[8192];
                int n;
                while ((n = in.read(buffer)) >= 0) digest.update(buffer, 0, n);
            }
            return Hex.hex(digest.digest());
        } catch (Exception e) {
            throw new BizException("计算文件摘要失败");
        }
    }

    private static String sha1Hex(byte[] bytes) {
        try {
            return Hex.hex(MessageDigest.getInstance("SHA-1").digest(bytes));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static String md5Hex(byte[] bytes) {
        try {
            return Hex.hex(MessageDigest.getInstance("MD5").digest(bytes));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static String queryValue(String query, String key) {
        if (!StringUtils.hasText(query)) return "";
        for (String item : query.split("&")) {
            String[] pair = item.split("=", 2);
            if (pair.length == 2 && key.equals(URLDecoder.decode(pair[0], StandardCharsets.UTF_8))) {
                return URLDecoder.decode(pair[1], StandardCharsets.UTF_8);
            }
        }
        return "";
    }

    private static String trimTrailingSlash(String value) {
        return StringUtils.hasText(value) ? value.trim().replaceAll("/+$", "") : "";
    }

    private static final class Hex {
        private static String hex(byte[] bytes) {
            StringBuilder out = new StringBuilder(bytes.length * 2);
            for (byte b : bytes) out.append(String.format("%02x", b));
            return out.toString();
        }
    }

    private static final class SetOf {
        private static final java.util.Set<String> WORD = java.util.Set.of(
                "doc", "docx", "docm", "dot", "dotx", "dotm", "rtf", "wps", "wpt");
        private static final java.util.Set<String> SHEET = java.util.Set.of(
                "xls", "xlsx", "xlsm", "xlt", "xltx", "xltm", "csv", "et");
        private static final java.util.Set<String> PPT = java.util.Set.of(
                "ppt", "pptx", "pptm", "pps", "ppsx", "ppsm", "potx", "potm", "dpt", "dps");
    }
}
