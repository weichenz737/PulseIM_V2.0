package com.pulse.api.controller;

import com.pulse.api.security.AuthContext;
import com.pulse.api.security.SecurityResponseWriter;
import com.pulse.api.entity.ImFile;
import com.pulse.api.service.FileConfigService;
import com.pulse.api.service.FileService;
import com.pulse.api.service.ChatFileStorageService;
import com.pulse.api.service.DocumentPreviewService;
import com.pulse.api.vo.FileMetadataVO;
import com.pulse.common.result.R;
import io.minio.GetObjectResponse;
import io.minio.StatObjectResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.net.URLEncoder;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/files")
@RequiredArgsConstructor
public class FileController {
    private final FileService fileService;
    private final ChatFileStorageService chatFileStorageService;
    private final FileConfigService fileConfigService;
    private final DocumentPreviewService documentPreviewService;

    /** 尊重客户端请求的 Range，避免安卓大视频点播失败 */
    private static final long RANGE_CHUNK = 4L * 1024 * 1024;

    /** 客户端读取文件发送参数（大小上限、允许类型），用于上传前校验 */
    @GetMapping("/config")
    public R<Map<String, Object>> fileConfig() {
        return R.ok(fileConfigService.getClientConfig());
    }

    @PostMapping("/avatar/presign")
    public R<Map<String, String>> presign(@RequestBody Map<String, String> body) {
        String contentType = body.getOrDefault("contentType", "image/jpeg");
        return R.ok(fileService.presignAvatar(AuthContext.currentUserId(), contentType));
    }

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public R<Map<String, Object>> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "videoCodecHint", required = false) String videoCodecHint,
            @RequestParam(value = "fileName", required = false) String fileName,
            @RequestParam(value = "durationMs", required = false) Long durationMs) {
        Map<String, Object> result = fileService.uploadChatFile(
                AuthContext.currentUserId(), file, videoCodecHint, fileName, durationMs);
        return R.ok(result);
    }

    /** Returns metadata only. The object itself remains in MinIO. */
    @GetMapping("/{fileId}/metadata")
    public R<FileMetadataVO> metadata(@PathVariable String fileId) {
        return R.ok(chatFileStorageService.metadata(AuthContext.currentUserId(), fileId));
    }

    /**
     * Authenticated object download/preview endpoint. It supports HTTP Range
     * so video, large documents and interrupted downloads do not need a second
     * transport channel.
     */
    @GetMapping("/{fileId}/download")
    public void download(
            @PathVariable String fileId,
            @RequestParam(value = "variant", required = false, defaultValue = "original") String variant,
            HttpServletRequest request,
            HttpServletResponse response) throws IOException {
        Long userId = AuthContext.currentUserId();
        FileMetadataVO metadata = chatFileStorageService.metadata(userId, fileId);
        StatObjectResponse stat = chatFileStorageService.stat(userId, fileId, variant);
        long total = stat.size();
        if (total <= 0) {
            response.sendError(HttpServletResponse.SC_NOT_FOUND);
            return;
        }

        long start = 0;
        long end = total - 1;
        boolean partial = false;
        String range = request.getHeader("Range");
        if (StringUtils.hasText(range) && range.startsWith("bytes=")) {
            String value = range.substring("bytes=".length()).split(",", 2)[0].trim();
            try {
                String[] bounds = value.split("-", 2);
                if (bounds.length != 2) throw new NumberFormatException();
                if (bounds[0].isBlank()) {
                    long suffix = Long.parseLong(bounds[1]);
                    start = Math.max(0, total - suffix);
                } else {
                    start = Long.parseLong(bounds[0]);
                    if (!bounds[1].isBlank()) end = Long.parseLong(bounds[1]);
                }
                if (start < 0 || start >= total || end < start) throw new NumberFormatException();
                end = Math.min(end, total - 1);
                partial = true;
            } catch (NumberFormatException e) {
                response.setHeader("Content-Range", "bytes */" + total);
                response.sendError(HttpServletResponse.SC_REQUESTED_RANGE_NOT_SATISFIABLE);
                return;
            }
        }

        long length = end - start + 1;
        String contentType = stat.contentType();
        if (!StringUtils.hasText(contentType)
                || "application/octet-stream".equalsIgnoreCase(contentType)
                || "binary/octet-stream".equalsIgnoreCase(contentType)) {
            contentType = metadata.getContentType();
        }
        response.reset();
        response.setBufferSize(64 * 1024);
        response.setStatus(partial ? HttpServletResponse.SC_PARTIAL_CONTENT : HttpServletResponse.SC_OK);
        response.setHeader("Accept-Ranges", "bytes");
        response.setHeader("Content-Length", String.valueOf(length));
        response.setHeader("Content-Type", StringUtils.hasText(contentType) ? contentType : MediaType.APPLICATION_OCTET_STREAM_VALUE);
        String downloadName = StringUtils.hasText(metadata.getName()) ? metadata.getName() : fileId;
        response.setHeader("Content-Disposition", "inline; filename*=UTF-8''" +
                URLEncoder.encode(downloadName, StandardCharsets.UTF_8).replace("+", "%20"));
        if (partial) response.setHeader("Content-Range", "bytes " + start + "-" + end + "/" + total);

        try (GetObjectResponse input = chatFileStorageService.open(userId, fileId, variant, start, length);
             OutputStream output = response.getOutputStream()) {
            input.transferTo(output);
        }
    }

    /**
     * Public profile-avatar rendition for legacy profiles whose avatar URL
     * points at a private chat-file download. The service only permits file ids
     * referenced by a user/admin avatar column, never arbitrary attachments.
     */
    @GetMapping("/{fileId}/avatar")
    public void profileAvatar(@PathVariable String fileId, HttpServletResponse response) throws IOException {
        ImFile file = chatFileStorageService.requireProfileAvatar(fileId);
        StatObjectResponse stat = chatFileStorageService.statProfileAvatar(file);
        long size = stat.size();
        if (size <= 0) {
            response.sendError(HttpServletResponse.SC_NOT_FOUND);
            return;
        }
        response.setStatus(HttpServletResponse.SC_OK);
        response.setContentType(chatFileStorageService.profileAvatarContentType(file));
        response.setContentLengthLong(size);
        response.setHeader("Content-Disposition", "inline");
        response.setHeader("Cache-Control", "public, max-age=2592000, immutable");
        try (GetObjectResponse input = chatFileStorageService.openProfileAvatar(file);
             OutputStream output = response.getOutputStream()) {
            input.transferTo(output);
        }
    }

    /**
     * Office preview for MinIO-backed chat files.  The source is streamed to
     * a short-lived local file only for LibreOffice conversion; the converted
     * PDF is kept in the document-preview cache and served with Range support.
     */
    @GetMapping("/{fileId}/preview")
    public void chatDocumentPreview(
            @PathVariable String fileId,
            HttpServletRequest request,
            HttpServletResponse response) throws IOException {
        Long userId = AuthContext.currentUserId();
        FileMetadataVO metadata = chatFileStorageService.metadata(userId, fileId);
        String extension = extensionOf(metadata.getName());
        String cacheIdentity = "chat-file:" + metadata.getFileId() + ":" + metadata.getSha256();
        Path cachedPdf = documentPreviewService.findCachedChatPdf(cacheIdentity, metadata.getSize());
        if (cachedPdf != null) {
            writeLocalPdfRange(cachedPdf, metadata.getName(), request, response);
            return;
        }
        Path source = Files.createTempFile("pulse-chat-document-",
                StringUtils.hasText(extension) ? "." + extension : ".bin");
        try {
            try (GetObjectResponse input = chatFileStorageService.open(userId, fileId, "original", 0, 0)) {
                Files.copy(input, source, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            }
            Path pdf = documentPreviewService.resolvePdf(source, cacheIdentity);
            writeLocalPdfRange(pdf, metadata.getName(), request, response);
        } finally {
            Files.deleteIfExists(source);
        }
    }

    @PostMapping("/multipart/init")
    public R<Map<String, Object>> initMultipart(@RequestBody Map<String, Object> body) {
        return R.ok(fileService.initMultipartUpload(
                AuthContext.currentUserId(),
                String.valueOf(body.getOrDefault("uploadId", "")),
                String.valueOf(body.getOrDefault("name", "video.mp4")),
                String.valueOf(body.getOrDefault("contentType", "video/mp4")),
                ((Number) body.getOrDefault("size", 0)).longValue(),
                ((Number) body.getOrDefault("chunkSize", 0)).intValue(),
                ((Number) body.getOrDefault("totalChunks", 0)).intValue(),
                String.valueOf(body.getOrDefault("videoCodecHint", "unknown"))
        ));
    }

    @GetMapping("/multipart/{uploadId}")
    public R<Map<String, Object>> multipartStatus(@PathVariable String uploadId) {
        return R.ok(fileService.multipartStatus(AuthContext.currentUserId(), uploadId));
    }

    @PostMapping(value = "/multipart/{uploadId}/chunks/{index}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public R<Map<String, Object>> uploadChunk(
            @PathVariable String uploadId,
            @PathVariable int index,
            @RequestParam("chunk") MultipartFile chunk) {
        return R.ok(fileService.saveMultipartChunk(AuthContext.currentUserId(), uploadId, index, chunk));
    }

    @PostMapping("/multipart/{uploadId}/complete")
    public R<Map<String, Object>> completeMultipart(@PathVariable String uploadId) {
        Map<String, Object> result = fileService.completeMultipartUpload(AuthContext.currentUserId(), uploadId);
        documentPreviewService.warmPreviewAsync(extractRawFilename(String.valueOf(result.get("url"))));
        return R.ok(result);
    }

    /**
     * 将聊天语音转为 16kHz 单声道 WAV（浏览器 decodeAudioData 常解不开 webm）。
     * body: { "url": "/api/v1/files/raw/xxx.webm" }
     * 返回 base64，避免代理/axios 弄坏二进制。
     */
    @PostMapping("/audio/wav-base64")
    public R<Map<String, String>> wavBase64FromUrl(@RequestBody Map<String, String> body) {
        Long userId = AuthContext.currentUserId();
        String url = body == null ? null : body.get("url");
        if (!StringUtils.hasText(url)) {
            throw new com.pulse.common.exception.BizException("url required");
        }
        String filename = extractRawFilename(url);
        if (!StringUtils.hasText(filename)) {
            throw new com.pulse.common.exception.BizException("invalid url");
        }
        byte[] wav = fileService.convertRawToWav16k(userId, filename);
        return R.ok(Map.of(
                "contentType", "audio/wav",
                "wavBase64", java.util.Base64.getEncoder().encodeToString(wav)
        ));
    }

    /** 上传语音并转为 16kHz 单声道 WAV（base64） */
    @PostMapping(value = "/audio/wav-base64-upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public R<Map<String, String>> wavBase64Upload(@RequestParam("file") MultipartFile file) {
        Long userId = AuthContext.currentUserId();
        byte[] wav = fileService.convertUploadToWav16k(userId, file);
        return R.ok(Map.of(
                "contentType", "audio/wav",
                "wavBase64", java.util.Base64.getEncoder().encodeToString(wav)
        ));
    }

    /** Converts a private MinIO-backed voice attachment and returns binary WAV. */
    @PostMapping("/audio/wav-from-file")
    public void wavFromFile(@RequestBody Map<String, String> body, HttpServletResponse response) throws IOException {
        Long userId = AuthContext.currentUserId();
        String fileId = body == null ? null : body.get("fileId");
        if (!StringUtils.hasText(fileId)) {
            response.sendError(HttpServletResponse.SC_BAD_REQUEST, "fileId required");
            return;
        }
        FileMetadataVO metadata = chatFileStorageService.metadata(userId, fileId);
        String extension = extensionOf(metadata.getName());
        Path source = Files.createTempFile("pulse-chat-audio-",
                StringUtils.hasText(extension) ? "." + extension : ".bin");
        try {
            try (GetObjectResponse input = chatFileStorageService.open(userId, fileId, "original", 0, 0)) {
                Files.copy(input, source, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            }
            writeWav(response, fileService.convertPathToWav16k(userId, source));
        } finally {
            Files.deleteIfExists(source);
        }
    }

    /**
     * @deprecated 保留兼容；请优先用 /audio/wav-base64
     */
    @PostMapping("/audio/wav-from-url")
    public void wavFromUrl(@RequestBody Map<String, String> body, HttpServletResponse response) throws IOException {
        Long userId = AuthContext.currentUserId();
        String url = body == null ? null : body.get("url");
        if (!StringUtils.hasText(url)) {
            response.sendError(HttpServletResponse.SC_BAD_REQUEST, "url required");
            return;
        }
        String filename = extractRawFilename(url);
        if (!StringUtils.hasText(filename)) {
            response.sendError(HttpServletResponse.SC_BAD_REQUEST, "invalid url");
            return;
        }
        byte[] wav = fileService.convertRawToWav16k(userId, filename);
        writeWav(response, wav);
    }

    /** @deprecated 保留兼容；请优先用 /audio/wav-base64-upload */
    @PostMapping(value = "/audio/wav", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public void wavUpload(@RequestParam("file") MultipartFile file, HttpServletResponse response) throws IOException {
        Long userId = AuthContext.currentUserId();
        byte[] wav = fileService.convertUploadToWav16k(userId, file);
        writeWav(response, wav);
    }

    private static void writeWav(HttpServletResponse response, byte[] wav) throws IOException {
        response.setStatus(HttpServletResponse.SC_OK);
        response.setContentType("audio/wav");
        response.setContentLength(wav.length);
        response.setHeader("Cache-Control", "no-store");
        try (OutputStream os = response.getOutputStream()) {
            os.write(wav);
        }
    }

    private static String extractRawFilename(String url) {
        String u = url.trim();
        int q = u.indexOf('?');
        if (q >= 0) u = u.substring(0, q);
        int idx = u.lastIndexOf("/files/raw/");
        if (idx < 0) return null;
        String name = u.substring(idx + "/files/raw/".length());
        if (!StringUtils.hasText(name) || name.contains("/") || name.contains("..")) return null;
        return name;
    }

    /**
     * 公开读取聊天附件。手动处理 HTTP Range（iOS/Android 视频播放必需）。
     * ?download=1 时强制附件下载，便于安卓用系统播放器打开。
     */
    @GetMapping("/raw/{filename}")
    public void raw(
            @PathVariable("filename") String filename,
            @RequestParam(value = "download", required = false) String download,
            @RequestParam(value = "avatar", required = false) String avatar,
            HttpServletRequest request,
            HttpServletResponse response
    ) throws IOException {
        boolean avatarPreview = "1".equals(avatar) || "true".equalsIgnoreCase(avatar);
        // 聊天附件需登录后访问（浏览器通过 HttpOnly Cookie 自动携带凭据）。
        // 历史头像链接可能在登录页加载，继续保留头像的公开读取兼容性。
        // APK 更新由 Android DownloadManager 在登录态之外执行；仅对服务端
        // 生成的 *_pulse.apk 放行，聊天附件仍必须登录后才能读取。
        boolean publicAppApk = filename.endsWith("_pulse.apk");
        if (AuthContext.currentUserId() == null && !publicAppApk && !avatarPreview) {
            SecurityResponseWriter.write(response, 401, "未登录或令牌无效");
            return;
        }
        Path path = avatarPreview ? fileService.resolveAvatarPath(filename) : fileService.resolveRawPath(filename);
        long fileSize = Files.size(path);
        String contentType = avatarPreview && path.getFileName().toString().endsWith("_avatar.jpg")
                ? MediaType.IMAGE_JPEG_VALUE
                : fileService.detectContentType(filename);
        if (!StringUtils.hasText(contentType)) {
            contentType = MediaType.APPLICATION_OCTET_STREAM_VALUE;
        }

        boolean forceDownload = "1".equals(download) || "true".equalsIgnoreCase(download);
        long lastModified = Files.getLastModifiedTime(path).toMillis();
        String etag = "\"" + Long.toHexString(fileSize) + "-" + Long.toHexString(lastModified) + "\"";
        response.setHeader("ETag", etag);
        response.setDateHeader("Last-Modified", lastModified);
        if (etag.equals(request.getHeader("If-None-Match"))) {
            response.setStatus(HttpServletResponse.SC_NOT_MODIFIED);
            return;
        }
        response.setHeader("Accept-Ranges", "bytes");
        response.setHeader("Cache-Control", avatarPreview
                ? "public, max-age=2592000, immutable"
                : "private, max-age=3600");
        response.setContentType(forceDownload ? MediaType.APPLICATION_OCTET_STREAM_VALUE : contentType);
        if (forceDownload) {
            String safe = filename.replace("\"", "");
            response.setHeader("Content-Disposition", "attachment; filename=\"" + safe + "\"");
        } else {
            response.setHeader("Content-Disposition", "inline; filename=\"" + filename.replace("\"", "") + "\"");
        }

        String rangeHeader = request.getHeader("Range");
        if (forceDownload || !StringUtils.hasText(rangeHeader) || !rangeHeader.startsWith("bytes=") || fileSize <= 0) {
            response.setStatus(HttpServletResponse.SC_OK);
            response.setContentLengthLong(fileSize);
            Files.copy(path, response.getOutputStream());
            return;
        }

        long[] se;
        try {
            se = parseBytesRange(rangeHeader, fileSize);
        } catch (RuntimeException e) {
            response.setHeader("Content-Range", "bytes */" + fileSize);
            response.setStatus(HttpServletResponse.SC_REQUESTED_RANGE_NOT_SATISFIABLE);
            return;
        }
        long start = se[0];
        long end = se[1];
        if (end - start + 1 > RANGE_CHUNK) {
            end = start + RANGE_CHUNK - 1;
        }
        if (end >= fileSize) {
            end = fileSize - 1;
        }
        if (start > end || start >= fileSize) {
            response.setHeader("Content-Range", "bytes */" + fileSize);
            response.setStatus(HttpServletResponse.SC_REQUESTED_RANGE_NOT_SATISFIABLE);
            return;
        }

        long len = end - start + 1;
        response.setStatus(HttpServletResponse.SC_PARTIAL_CONTENT);
        response.setHeader("Content-Range", "bytes " + start + "-" + end + "/" + fileSize);
        response.setContentLengthLong(len);

        try (RandomAccessFile raf = new RandomAccessFile(path.toFile(), "r");
             OutputStream os = response.getOutputStream()) {
            raf.seek(start);
            byte[] buf = new byte[64 * 1024];
            long remaining = len;
            while (remaining > 0) {
                int n = raf.read(buf, 0, (int) Math.min(buf.length, remaining));
                if (n < 0) break;
                os.write(buf, 0, n);
                remaining -= n;
            }
            os.flush();
        }
    }

    private static String extensionOf(String name) {
        String value = StringUtils.hasText(name) ? name.trim() : "";
        int dot = value.lastIndexOf('.');
        if (dot < 0 || dot == value.length() - 1) return "";
        String extension = value.substring(dot + 1).replaceAll("[^A-Za-z0-9]", "");
        return extension.length() > 8 ? "" : extension.toLowerCase(java.util.Locale.ROOT);
    }

    /**
     * 返回可供 PDF.js 渲染的 PDF。Office 文件会由 LibreOffice Headless
     * 转换并缓存；原始 PDF 直接返回。该接口与 raw 一样要求登录。
     */
    @GetMapping("/preview/{filename}")
    public void documentPreview(
            @PathVariable("filename") String filename,
            HttpServletRequest request,
            HttpServletResponse response
    ) throws IOException {
        if (AuthContext.currentUserId() == null) {
            SecurityResponseWriter.write(response, 401, "未登录或令牌无效");
            return;
        }
        Path pdf = documentPreviewService.resolvePdf(filename);
        long size = Files.size(pdf);
        long modified = Files.getLastModifiedTime(pdf).toMillis();
        String etag = "\"" + Long.toHexString(size) + "-" + Long.toHexString(modified) + "\"";
        response.setHeader("ETag", etag);
        response.setDateHeader("Last-Modified", modified);
        response.setHeader("Accept-Ranges", "bytes");
        response.setHeader("Cache-Control", "private, max-age=3600");
        if (etag.equals(request.getHeader("If-None-Match"))) {
            response.setStatus(HttpServletResponse.SC_NOT_MODIFIED);
            return;
        }
        response.setStatus(HttpServletResponse.SC_OK);
        response.setContentType(MediaType.APPLICATION_PDF_VALUE);
        response.setHeader("Content-Disposition", "inline; filename=\"preview.pdf\"");
        String rangeHeader = request.getHeader("Range");
        if (!StringUtils.hasText(rangeHeader) || !rangeHeader.startsWith("bytes=") || size <= 0) {
            response.setContentLengthLong(size);
            Files.copy(pdf, response.getOutputStream());
            return;
        }

        long[] range;
        try {
            range = parseBytesRange(rangeHeader, size);
        } catch (RuntimeException e) {
            response.setHeader("Content-Range", "bytes */" + size);
            response.setStatus(HttpServletResponse.SC_REQUESTED_RANGE_NOT_SATISFIABLE);
            return;
        }
        long start = range[0];
        long end = Math.min(range[1], start + RANGE_CHUNK - 1);
        if (start > end || start >= size) {
            response.setHeader("Content-Range", "bytes */" + size);
            response.setStatus(HttpServletResponse.SC_REQUESTED_RANGE_NOT_SATISFIABLE);
            return;
        }
        long length = end - start + 1;
        response.setStatus(HttpServletResponse.SC_PARTIAL_CONTENT);
        response.setHeader("Content-Range", "bytes " + start + "-" + end + "/" + size);
        response.setContentLengthLong(length);
        try (RandomAccessFile raf = new RandomAccessFile(pdf.toFile(), "r");
             OutputStream output = response.getOutputStream()) {
            raf.seek(start);
            byte[] buffer = new byte[64 * 1024];
            long remaining = length;
            while (remaining > 0) {
                int read = raf.read(buffer, 0, (int) Math.min(buffer.length, remaining));
                if (read < 0) break;
                output.write(buffer, 0, read);
                remaining -= read;
            }
            output.flush();
        }
    }

    private static void writeLocalPdfRange(
            Path pdf, String sourceName, HttpServletRequest request, HttpServletResponse response) throws IOException {
        long size = Files.size(pdf);
        long modified = Files.getLastModifiedTime(pdf).toMillis();
        String etag = "\"" + Long.toHexString(size) + "-" + Long.toHexString(modified) + "\"";
        response.setHeader("ETag", etag);
        response.setDateHeader("Last-Modified", modified);
        response.setHeader("Accept-Ranges", "bytes");
        response.setHeader("Cache-Control", "private, max-age=3600");
        if (etag.equals(request.getHeader("If-None-Match"))) {
            response.setStatus(HttpServletResponse.SC_NOT_MODIFIED);
            return;
        }
        response.setContentType(MediaType.APPLICATION_PDF_VALUE);
        response.setHeader("Content-Disposition", "inline; filename*=UTF-8''" +
                URLEncoder.encode(StringUtils.hasText(sourceName) ? sourceName : "preview.pdf", StandardCharsets.UTF_8)
                        .replace("+", "%20"));

        String rangeHeader = request.getHeader("Range");
        if (!StringUtils.hasText(rangeHeader) || !rangeHeader.startsWith("bytes=") || size <= 0) {
            response.setStatus(HttpServletResponse.SC_OK);
            response.setContentLengthLong(size);
            Files.copy(pdf, response.getOutputStream());
            return;
        }
        long[] range;
        try {
            range = parseBytesRange(rangeHeader, size);
        } catch (RuntimeException e) {
            response.setHeader("Content-Range", "bytes */" + size);
            response.setStatus(HttpServletResponse.SC_REQUESTED_RANGE_NOT_SATISFIABLE);
            return;
        }
        long start = range[0];
        long end = Math.min(range[1], start + RANGE_CHUNK - 1);
        if (start > end || start >= size) {
            response.setHeader("Content-Range", "bytes */" + size);
            response.setStatus(HttpServletResponse.SC_REQUESTED_RANGE_NOT_SATISFIABLE);
            return;
        }
        long length = end - start + 1;
        response.setStatus(HttpServletResponse.SC_PARTIAL_CONTENT);
        response.setHeader("Content-Range", "bytes " + start + "-" + end + "/" + size);
        response.setContentLengthLong(length);
        try (RandomAccessFile raf = new RandomAccessFile(pdf.toFile(), "r");
             OutputStream output = response.getOutputStream()) {
            raf.seek(start);
            byte[] buffer = new byte[64 * 1024];
            long remaining = length;
            while (remaining > 0) {
                int read = raf.read(buffer, 0, (int) Math.min(buffer.length, remaining));
                if (read < 0) break;
                output.write(buffer, 0, read);
                remaining -= read;
            }
            output.flush();
        }
    }

    /** 解析 bytes=start-end / bytes=start- / bytes=-suffix */
    private static long[] parseBytesRange(String rangeHeader, long fileSize) {
        if (fileSize <= 0) throw new IllegalArgumentException("empty file");
        String spec = rangeHeader.substring("bytes=".length()).trim();
        int comma = spec.indexOf(',');
        if (comma >= 0) {
            spec = spec.substring(0, comma).trim();
        }
        long start;
        long end;
        if (spec.startsWith("-")) {
            long suffix = Long.parseLong(spec.substring(1));
            if (suffix <= 0) throw new IllegalArgumentException("invalid suffix");
            start = Math.max(0, fileSize - suffix);
            end = fileSize - 1;
        } else {
            String[] parts = spec.split("-", 2);
            if (parts.length == 0 || !StringUtils.hasText(parts[0])) {
                throw new IllegalArgumentException("missing start");
            }
            start = Long.parseLong(parts[0]);
            if (parts.length > 1 && StringUtils.hasText(parts[1])) {
                end = Long.parseLong(parts[1]);
            } else {
                end = fileSize - 1;
            }
        }
        if (start < 0 || start >= fileSize || end < start) {
            throw new IllegalArgumentException("range outside file");
        }
        if (end >= fileSize) end = fileSize - 1;
        return new long[]{start, end};
    }
}
