package com.pulse.api.service;

import net.dongliu.apk.parser.ApkFile;
import net.dongliu.apk.parser.bean.ApkMeta;
import com.pulse.api.config.MinioProperties;
import com.pulse.common.exception.BizException;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.MinioClient;
import io.minio.http.Method;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.HashMap;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class FileService {
    private final FileConfigService fileConfigService;
    private final ChatFileStorageService chatFileStorageService;

    private static final Set<String> DENY_UPLOAD_EXT = Set.of(
            ".html", ".htm", ".svg", ".js", ".mjs", ".xml", ".css",
            ".php", ".jsp", ".asp", ".aspx", ".dll", ".sh", ".bat",
            ".cmd", ".ps1", ".vbs", ".jar", ".war", ".msi", ".com",
            ".scr", ".pif"
    );
    private static final int ASR_PER_MINUTE_LIMIT = 6;
    private static final int WAV_PER_MINUTE_LIMIT = 12;

    private static final ExecutorService VIDEO_TRANSCODE_EXECUTOR =
            Executors.newFixedThreadPool(2, task -> {
                Thread thread = new Thread(task, "pulse-video-transcode");
                thread.setDaemon(true);
                return thread;
            });

    private final MinioClient minioClient;
    private final MinioProperties props;
    private final StringRedisTemplate redis;

    @Value("${pulse.upload.dir:uploads}")
    private String uploadDir;

    @Value("${pulse.ffmpeg.path:}")
    private String ffmpegPath;

    /** ASR 常驻服务地址，例如 http://pulse-asr:3978/transcribe */
    @Value("${pulse.asr.url:http://127.0.0.1:3978/transcribe}")
    private String asrUrl;

    private Path uploadRoot;

    /** 避免列表页并发首次请求重复压缩同一头像 */
    private final ConcurrentHashMap<String, Object> avatarLocks = new ConcurrentHashMap<>();

    @jakarta.annotation.PostConstruct
    public void initUploadRoot() {
        this.uploadRoot = resolveConfiguredRoot();
        try {
            Files.createDirectories(this.uploadRoot);
        } catch (IOException e) {
            log.warn("create upload root failed: {} ({})", this.uploadRoot, e.getMessage());
        }
        log.info("Upload root fixed at: {}", this.uploadRoot);
    }

    public Map<String, String> presignAvatar(Long userId, String contentType) {
        String ct = contentType == null ? "" : contentType.toLowerCase(Locale.ROOT).trim();
        if (!Set.of("image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp").contains(ct)) {
            throw new BizException("头像仅支持 jpg/png/webp/gif/bmp");
        }
        String ext = guessExt(contentType);
        String object = "avatar/" + userId + "/" + UUID.randomUUID() + ext;
        try {
            String uploadUrl = minioClient.getPresignedObjectUrl(
                    GetPresignedObjectUrlArgs.builder()
                            .method(Method.PUT)
                            .bucket(props.getBucket())
                            .object(object)
                            .expiry(15, TimeUnit.MINUTES)
                            .build()
            );
            Map<String, String> result = new HashMap<>();
            result.put("uploadUrl", uploadUrl);
            result.put("objectKey", object);
            result.put("publicUrl", props.getPublicBaseUrl() + "/" + object);
            return result;
        } catch (Exception e) {
            throw new BizException("生成上传凭证失败: " + e.getMessage());
        }
    }

    /** Chat attachments are stored in MinIO; this facade keeps old callers stable. */
    public Map<String, Object> uploadChatFile(Long userId, MultipartFile file) {
        return uploadChatFile(userId, file, null, null);
    }

    /** Chat attachments are stored in MinIO; this facade keeps old callers stable. */
    public Map<String, Object> uploadChatFile(Long userId, MultipartFile file, String videoCodecHint) {
        return uploadChatFile(userId, file, videoCodecHint, null);
    }

    /**
     * 聊天附件本地上传。fileName 由客户端以 UTF-8 表单字段传递，优先于
     * multipart 的 Content-Disposition 文件名，避免 Android WebView 把中文名解码成乱码。
     */
    public Map<String, Object> uploadChatFile(
            Long userId, MultipartFile file, String videoCodecHint, String clientFileName) {
        return chatFileStorageService.upload(userId, file, videoCodecHint, clientFileName);
    }

    public Map<String, Object> uploadChatFile(
            Long userId, MultipartFile file, String videoCodecHint, String clientFileName, Long durationMs) {
        return chatFileStorageService.upload(userId, file, videoCodecHint, clientFileName, durationMs);
    }

    private Path multipartDir(Long userId, String uploadId) {
        String safeId = uploadId == null ? "" : uploadId.replaceAll("[^a-zA-Z0-9_-]", "");
        if (safeId.length() < 12 || safeId.length() > 96) throw new BizException("invalid uploadId");
        Path root = resolveUploadRoot().resolve(".multipart").resolve(String.valueOf(userId)).normalize();
        Path dir = root.resolve(safeId).normalize();
        if (!dir.startsWith(root)) throw new BizException("invalid uploadId");
        return dir;
    }

    public Map<String, Object> initMultipartUpload(
            Long userId, String uploadId, String name, String contentType, long size,
            int chunkSize, int totalChunks, String videoCodecHint) {
        if (size <= 0) throw new BizException("invalid file size");
        fileConfigService.assertFileAllowed(name, contentType, size);
        if (chunkSize < 512 * 1024 || chunkSize > 8 * 1024 * 1024) throw new BizException("invalid chunk size");
        int expected = (int) ((size + chunkSize - 1) / chunkSize);
        if (totalChunks != expected || totalChunks < 1 || totalChunks > 200) {
            throw new BizException("invalid chunk count");
        }
        Path dir = multipartDir(userId, uploadId);
        try {
            Files.createDirectories(dir);
            Path metadata = dir.resolve("upload.properties");
            if (!Files.isRegularFile(metadata)) {
                Properties p = new Properties();
                p.setProperty("name", normalizeClientFilename(name));
                p.setProperty("contentType", StringUtils.hasText(contentType) ? contentType : "video/mp4");
                p.setProperty("size", String.valueOf(size));
                p.setProperty("chunkSize", String.valueOf(chunkSize));
                p.setProperty("totalChunks", String.valueOf(totalChunks));
                p.setProperty("videoCodecHint", StringUtils.hasText(videoCodecHint) ? videoCodecHint : "unknown");
                p.setProperty("createdAt", String.valueOf(System.currentTimeMillis()));
                try (OutputStream out = Files.newOutputStream(metadata)) {
                    p.store(out, "PulseIM resumable upload");
                }
            }
            return multipartStatus(userId, uploadId);
        } catch (IOException e) {
            throw new BizException("init multipart upload failed: " + e.getMessage());
        }
    }

    private Properties multipartMetadata(Path dir) throws IOException {
        Properties p = new Properties();
        try (InputStream in = Files.newInputStream(dir.resolve("upload.properties"))) {
            p.load(in);
        }
        return p;
    }

    public Map<String, Object> multipartStatus(Long userId, String uploadId) {
        Path dir = multipartDir(userId, uploadId);
        if (!Files.isRegularFile(dir.resolve("upload.properties"))) {
            return Map.of("uploadId", uploadId, "uploaded", List.of());
        }
        try {
            Properties p = multipartMetadata(dir);
            int total = Integer.parseInt(p.getProperty("totalChunks"));
            List<Integer> uploaded = new ArrayList<>();
            for (int i = 0; i < total; i++) {
                if (Files.isRegularFile(dir.resolve(i + ".part"))) uploaded.add(i);
            }
            return Map.of("uploadId", uploadId, "uploaded", uploaded, "totalChunks", total);
        } catch (Exception e) {
            throw new BizException("read multipart status failed: " + e.getMessage());
        }
    }

    public Map<String, Object> saveMultipartChunk(
            Long userId, String uploadId, int index, MultipartFile chunk) {
        Path dir = multipartDir(userId, uploadId);
        try {
            Properties p = multipartMetadata(dir);
            int total = Integer.parseInt(p.getProperty("totalChunks"));
            int chunkSize = Integer.parseInt(p.getProperty("chunkSize"));
            long size = Long.parseLong(p.getProperty("size"));
            if (index < 0 || index >= total || chunk == null || chunk.isEmpty()) {
                throw new BizException("invalid chunk");
            }
            long expected = index == total - 1 ? size - (long) index * chunkSize : chunkSize;
            if (chunk.getSize() != expected) throw new BizException("invalid chunk size");
            Path target = dir.resolve(index + ".part");
            Path temp = dir.resolve(index + ".part.tmp");
            try (InputStream in = chunk.getInputStream()) {
                Files.copy(in, temp, StandardCopyOption.REPLACE_EXISTING);
            }
            Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
            return Map.of("index", index, "size", expected);
        } catch (BizException e) {
            throw e;
        } catch (Exception e) {
            throw new BizException("save chunk failed: " + e.getMessage());
        }
    }

    public Map<String, Object> completeMultipartUpload(Long userId, String uploadId) {
        Path dir = multipartDir(userId, uploadId);
        Path assembled = dir.resolve("assembled.tmp");
        try {
            Properties p = multipartMetadata(dir);
            int total = Integer.parseInt(p.getProperty("totalChunks"));
            long expectedSize = Long.parseLong(p.getProperty("size"));
            try (OutputStream out = Files.newOutputStream(assembled)) {
                for (int i = 0; i < total; i++) {
                    Path part = dir.resolve(i + ".part");
                    if (!Files.isRegularFile(part)) throw new BizException("missing chunk " + i);
                    Files.copy(part, out);
                }
            }
            if (Files.size(assembled) != expectedSize) throw new BizException("assembled size mismatch");
            MultipartFile file = new PathMultipartFile(
                    assembled, p.getProperty("name"), p.getProperty("contentType"));
            Map<String, Object> result = uploadChatFile(
                    userId, file, p.getProperty("videoCodecHint", "unknown"));
            try (var paths = Files.walk(dir)) {
                for (Path path : paths.sorted(java.util.Comparator.reverseOrder()).toList()) {
                    Files.deleteIfExists(path);
                }
            }
            return result;
        } catch (BizException e) {
            throw e;
        } catch (Exception e) {
            throw new BizException("complete multipart upload failed: " + e.getMessage());
        }
    }

    private static final class PathMultipartFile implements MultipartFile {
        private final Path path;
        private final String name;
        private final String contentType;
        private PathMultipartFile(Path path, String name, String contentType) {
            this.path = path;
            this.name = name;
            this.contentType = contentType;
        }
        public String getName() { return "file"; }
        public String getOriginalFilename() { return name; }
        public String getContentType() { return contentType; }
        public boolean isEmpty() { try { return Files.size(path) == 0; } catch (IOException e) { return true; } }
        public long getSize() { try { return Files.size(path); } catch (IOException e) { return 0; } }
        public byte[] getBytes() throws IOException { return Files.readAllBytes(path); }
        public InputStream getInputStream() throws IOException { return Files.newInputStream(path); }
        public void transferTo(java.io.File dest) throws IOException { Files.copy(path, dest.toPath(), StandardCopyOption.REPLACE_EXISTING); }
    }

    /**
     * 管理端上传来电铃声：音频直接保存；mp4/mov 等提取音轨转成 mp3。
     */
    public Map<String, Object> uploadRingtone(Long adminId, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BizException("请选择铃声文件");
        }
        if (file.getSize() > 20L * 1024 * 1024) {
            throw new BizException("铃声不能超过 20MB");
        }
        String original = file.getOriginalFilename();
        String safeName = sanitizeFileName(original);
        String contentType = file.getContentType() == null ? "" : file.getContentType().toLowerCase(Locale.ROOT);
        String ext = "";
        int dot = safeName.lastIndexOf('.');
        if (dot > 0 && dot < safeName.length() - 1) {
            ext = safeName.substring(dot).toLowerCase(Locale.ROOT);
        }
        boolean isAudio = contentType.startsWith("audio/")
                || Set.of(".mp3", ".wav", ".ogg", ".m4a", ".aac").contains(ext);
        boolean isVideo = contentType.startsWith("video/")
                || Set.of(".mp4", ".mov", ".m4v", ".webm").contains(ext);
        if (!isAudio && !isVideo) {
            throw new BizException("仅支持 mp3/wav/ogg/m4a/aac，或 mp4 视频转音频");
        }

        Path root = resolveUploadRoot();
        String baseId = UUID.randomUUID().toString().replace("-", "");
        try {
            Files.createDirectories(root);
            Path source = root.resolve(baseId + "_src" + (StringUtils.hasText(ext) ? ext : "")).normalize();
            if (!source.startsWith(root)) {
                throw new BizException("非法文件路径");
            }
            file.transferTo(source);

            Path audioPath = source;
            String audioExt = ext;
            String audioType = contentType;
            if (isVideo || ".mp4".equals(ext) || ".mov".equals(ext) || ".m4v".equals(ext) || ".webm".equals(ext)) {
                Path mp3 = convertToRingtoneMp3(source, baseId);
                if (mp3 == null) {
                    throw new BizException("视频转音频失败，请换 mp3 再试");
                }
                try {
                    Files.deleteIfExists(source);
                } catch (Exception ignore) {
                    /* ignore */
                }
                audioPath = mp3;
                audioExt = ".mp3";
                audioType = "audio/mpeg";
            } else if (".wav".equals(ext) || ".m4a".equals(ext) || ".aac".equals(ext) || ".ogg".equals(ext)) {
                // 统一为 mp3，提升各端兼容性
                Path mp3 = convertToRingtoneMp3(source, baseId);
                if (mp3 != null) {
                    try {
                        Files.deleteIfExists(source);
                    } catch (Exception ignore) {
                        /* ignore */
                    }
                    audioPath = mp3;
                    audioExt = ".mp3";
                    audioType = "audio/mpeg";
                }
            }

            String stored = audioPath.getFileName().toString();
            long size = Files.size(audioPath);
            Map<String, Object> result = new HashMap<>();
            result.put("url", "/api/v1/files/raw/" + stored);
            result.put("name", StringUtils.hasText(original) ? original : ("ringtone" + audioExt));
            result.put("size", size);
            result.put("contentType", StringUtils.hasText(audioType) ? audioType : "audio/mpeg");
            result.put("uploaderId", adminId == null ? 0L : adminId);
            return result;
        } catch (BizException e) {
            throw e;
        } catch (Exception e) {
            throw new BizException("铃声上传失败: " + e.getMessage());
        }
    }

    public Map<String, Object> uploadAppApk(Long adminId, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BizException("请选择 APK 安装包");
        }
        String original = file.getOriginalFilename();
        if (!StringUtils.hasText(original) || !original.toLowerCase(Locale.ROOT).endsWith(".apk")) {
            throw new BizException("仅支持 .apk 安装包");
        }
        if (file.getSize() > 500L * 1024 * 1024) {
            throw new BizException("安装包不能超过 500MB");
        }
        Path root = resolveUploadRoot();
        String stored = UUID.randomUUID().toString().replace("-", "") + "_pulse.apk";
        Path target = root.resolve(stored).normalize();
        if (!target.startsWith(root)) {
            throw new BizException("非法文件路径");
        }
        try {
            Files.createDirectories(root);
            file.transferTo(target);
            ApkMeta apkMeta;
            try (ApkFile apkFile = new ApkFile(target.toFile())) {
                apkMeta = apkFile.getApkMeta();
            }
            long versionCode = apkMeta.getVersionCode();
            if (versionCode < 1 || versionCode > Integer.MAX_VALUE) {
                Files.deleteIfExists(target);
                throw new BizException("APK 内的版本编号无效");
            }
            Map<String, Object> result = new HashMap<>();
            result.put("url", "/api/v1/files/raw/" + stored);
            result.put("name", original);
            result.put("size", Files.size(target));
            result.put("contentType", "application/vnd.android.package-archive");
            result.put("uploaderId", adminId == null ? 0L : adminId);
            result.put("versionCode", versionCode);
            result.put("versionName", apkMeta.getVersionName());
            return result;
        } catch (Exception e) {
            try {
                Files.deleteIfExists(target);
            } catch (Exception ignored) {
            }
            if (e instanceof BizException bizException) {
                throw bizException;
            }
            throw new BizException("安装包上传失败: " + e.getMessage());
        }
    }

    private Path convertToRingtoneMp3(Path source, String baseId) {
        String ffmpeg = resolveFfmpegBinary();
        Path out = resolveUploadRoot().resolve(baseId + "_ring.mp3").normalize();
        try {
            ProcessBuilder pb = new ProcessBuilder(
                    ffmpeg,
                    "-y",
                    "-i", source.toAbsolutePath().toString(),
                    "-vn",
                    "-ac", "1",
                    "-ar", "44100",
                    "-b:a", "128k",
                    "-f", "mp3",
                    out.toAbsolutePath().toString()
            );
            pb.redirectErrorStream(true);
            Process p = pb.start();
            String logTail = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            boolean finished = p.waitFor(90, TimeUnit.SECONDS);
            if (!finished) {
                p.destroyForcibly();
                log.warn("ringtone ffmpeg timeout for {}", source.getFileName());
                return null;
            }
            if (p.exitValue() != 0 || !Files.isRegularFile(out) || Files.size(out) < 64) {
                log.warn("ringtone ffmpeg failed for {}: {}", source.getFileName(),
                        logTail.length() > 400 ? logTail.substring(logTail.length() - 400) : logTail);
                return null;
            }
            return out;
        } catch (Exception ex) {
            log.warn("ringtone ffmpeg error: {}", ex.toString());
            return null;
        }
    }

    private static boolean isImageExt(String ext) {
        if (ext == null) return false;
        String e = ext.toLowerCase(Locale.ROOT);
        return e.equals(".jpg") || e.equals(".jpeg") || e.equals(".png")
                || e.equals(".webp") || e.equals(".gif") || e.equals(".bmp");
    }

    private static boolean isVideoExt(String ext) {
        if (ext == null) return false;
        String e = ext.toLowerCase(Locale.ROOT);
        return e.equals(".mp4") || e.equals(".mov") || e.equals(".m4v")
                || e.equals(".webm") || e.equals(".mkv");
    }

    /** 聊天预览图：最长边 1280，JPEG */
    private Path createImagePreview(Path source, String baseId) {
        try {
            System.setProperty("java.awt.headless", "true");
            java.awt.image.BufferedImage src = javax.imageio.ImageIO.read(source.toFile());
            if (src == null) {
                return null;
            }
            int maxEdge = 720;
            int w = src.getWidth();
            int h = src.getHeight();
            if (w <= 0 || h <= 0) {
                return null;
            }
            double scale = Math.min(1.0, (double) maxEdge / Math.max(w, h));
            int nw = Math.max(1, (int) Math.round(w * scale));
            int nh = Math.max(1, (int) Math.round(h * scale));
            java.awt.image.BufferedImage outImg = new java.awt.image.BufferedImage(nw, nh, java.awt.image.BufferedImage.TYPE_INT_RGB);
            java.awt.Graphics2D g = outImg.createGraphics();
            g.setRenderingHint(java.awt.RenderingHints.KEY_INTERPOLATION, java.awt.RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g.setColor(java.awt.Color.WHITE);
            g.fillRect(0, 0, nw, nh);
            g.drawImage(src, 0, 0, nw, nh, null);
            g.dispose();
            Path out = resolveUploadRoot().resolve(baseId + ".jpg").normalize();
            writeCompressedJpeg(outImg, out, 0.68f);
            if (!Files.isRegularFile(out) || Files.size(out) < 32) {
                Files.deleteIfExists(out);
                return null;
            }
            return out;
        } catch (Exception e) {
            log.warn("create image preview failed: {}", e.toString());
            return null;
        }
    }

    /** 聊天预览视频：约 960 边、较快压缩 */
    private void writeCompressedJpeg(java.awt.image.BufferedImage image, Path target, float quality)
            throws IOException {
        java.util.Iterator<javax.imageio.ImageWriter> writers =
                javax.imageio.ImageIO.getImageWritersByFormatName("jpg");
        if (!writers.hasNext()) {
            throw new IOException("JPEG writer unavailable");
        }
        javax.imageio.ImageWriter writer = writers.next();
        try (javax.imageio.stream.ImageOutputStream output =
                     javax.imageio.ImageIO.createImageOutputStream(target.toFile())) {
            writer.setOutput(output);
            javax.imageio.ImageWriteParam params = writer.getDefaultWriteParam();
            if (params.canWriteCompressed()) {
                params.setCompressionMode(javax.imageio.ImageWriteParam.MODE_EXPLICIT);
                params.setCompressionQuality(Math.max(0.1f, Math.min(1.0f, quality)));
            }
            writer.write(null, new javax.imageio.IIOImage(image, null, null), params);
        } finally {
            writer.dispose();
        }
    }

    private Path createVideoPreview(Path source, String baseId) {
        String ffmpeg = resolveFfmpegBinary();
        Path out = resolveUploadRoot().resolve(baseId + ".mp4").normalize();
        try {
            ProcessBuilder pb = new ProcessBuilder(
                    ffmpeg,
                    "-y",
                    "-i", source.toAbsolutePath().toString(),
                    "-vf", "scale='min(640,iw)':-2:flags=lanczos",
                    "-c:v", "libx264",
                    "-preset", "veryfast",
                    "-crf", "32",
                    "-profile:v", "main",
                    "-pix_fmt", "yuv420p",
                    "-c:a", "aac",
                    "-b:a", "64k",
                    "-movflags", "+faststart",
                    out.toAbsolutePath().toString()
            );
            pb.redirectErrorStream(true);
            Process p = pb.start();
            String logTail = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            boolean finished = p.waitFor(150, TimeUnit.SECONDS);
            if (!finished) {
                p.destroyForcibly();
                Files.deleteIfExists(out);
                log.warn("video preview timeout for {}", source.getFileName());
                return null;
            }
            if (p.exitValue() != 0 || !Files.isRegularFile(out) || Files.size(out) < 1024) {
                Files.deleteIfExists(out);
                log.warn("video preview failed for {}: {}", source.getFileName(),
                        logTail.length() > 300 ? logTail.substring(logTail.length() - 300) : logTail);
                return null;
            }
            return out;
        } catch (Exception ex) {
            try {
                Files.deleteIfExists(out);
            } catch (IOException ignored) {
            }
            log.warn("video preview error: {}", ex.toString());
            return null;
        }
    }

    /** 视频封面缩略图 */
    private void transcodeVideoInBackground(Path source, String baseId) {
        VIDEO_TRANSCODE_EXECUTOR.execute(() -> {
            Path preview = createVideoPreview(source, baseId);
            if (preview == null) {
                return;
            }
            try {
                try {
                    Files.move(preview, source, StandardCopyOption.REPLACE_EXISTING,
                            StandardCopyOption.ATOMIC_MOVE);
                } catch (java.nio.file.AtomicMoveNotSupportedException ignored) {
                    Files.move(preview, source, StandardCopyOption.REPLACE_EXISTING);
                }
                createVideoThumb(source, baseId);
                log.info("background HEVC preview ready: {}", source.getFileName());
            } catch (Exception ex) {
                try {
                    Files.deleteIfExists(preview);
                } catch (IOException ignored) {
                }
                log.warn("background HEVC preview replace failed for {}: {}",
                        source.getFileName(), ex.toString());
            }
        });
    }

    private void prepareVideoInBackground(Path source, String baseId) {
        VIDEO_TRANSCODE_EXECUTOR.execute(() -> {
            if (looksLikeHevc(source)) {
                Path preview = createVideoPreview(source, baseId);
                if (preview == null) {
                    return;
                }
                try {
                    try {
                        Files.move(preview, source, StandardCopyOption.REPLACE_EXISTING,
                                StandardCopyOption.ATOMIC_MOVE);
                    } catch (java.nio.file.AtomicMoveNotSupportedException ignored) {
                        Files.move(preview, source, StandardCopyOption.REPLACE_EXISTING);
                    }
                    createVideoThumb(source, baseId);
                    log.info("background detected HEVC preview ready: {}", source.getFileName());
                } catch (Exception ex) {
                    try {
                        Files.deleteIfExists(preview);
                    } catch (IOException ignored) {
                    }
                    log.warn("background detected HEVC replace failed for {}: {}",
                            source.getFileName(), ex.toString());
                }
                return;
            }
            createVideoThumb(source, baseId);
        });
    }

    private Path createVideoThumb(Path source, String baseId) {
        String ffmpeg = resolveFfmpegBinary();
        Path out = resolveUploadRoot().resolve(baseId + "_t.jpg").normalize();
        try {
            ProcessBuilder pb = new ProcessBuilder(
                    ffmpeg,
                    "-y",
                    "-ss", "0.15",
                    "-i", source.toAbsolutePath().toString(),
                    "-frames:v", "1",
                    "-q:v", "6",
                    "-vf", "scale='min(480,iw)':-2",
                    out.toAbsolutePath().toString()
            );
            pb.redirectErrorStream(true);
            pb.redirectOutput(ProcessBuilder.Redirect.DISCARD);
            Process p = pb.start();
            boolean finished = p.waitFor(15, TimeUnit.SECONDS);
            if (!finished) {
                p.destroyForcibly();
                Files.deleteIfExists(out);
                return null;
            }
            if (p.exitValue() != 0 || !Files.isRegularFile(out) || Files.size(out) < 32) {
                Files.deleteIfExists(out);
                return null;
            }
            return out;
        } catch (Exception ex) {
            try {
                Files.deleteIfExists(out);
            } catch (IOException ignored) {
            }
            log.warn("video thumb error: {}", ex.toString());
            return null;
        }
    }

    public Path resolveRawPath(String filename) {
        String safe = sanitizeStoredName(filename);
        Path root = resolveUploadRoot();
        Path target = root.resolve(safe).normalize();
        if (target.startsWith(root) && Files.isRegularFile(target)) {
            return target;
        }
        // 兼容历史上因工作目录不同散落的 uploads
        for (Path legacy : legacyUploadRoots()) {
            Path p = legacy.resolve(safe).normalize();
            if (p.startsWith(legacy) && Files.isRegularFile(p)) {
                return p;
            }
        }
        throw new BizException("文件不存在");
    }

    /**
     * Resolve the UUID-based chat attachment id used by WPS WebOffice callbacks.
     * The original upload is named {uuid}_o.ext; resumable uploads use {uuid}_src.ext.
     */
    public Path resolveWebOfficePath(String fileId) {
        if (fileId == null || !fileId.matches("[A-Za-z0-9]{32}")) {
            throw new BizException("WPS 文件不存在");
        }
        java.util.List<Path> roots = new java.util.ArrayList<>();
        roots.add(resolveUploadRoot());
        roots.addAll(legacyUploadRoots());
        for (Path root : roots) {
            if (root == null || !Files.isDirectory(root)) continue;
            try (var stream = Files.list(root)) {
                Path found = stream
                        .filter(Files::isRegularFile)
                        .filter(path -> {
                            String name = path.getFileName().toString();
                            return name.startsWith(fileId + "_o") || name.startsWith(fileId + "_src");
                        })
                        .sorted((a, b) -> {
                            boolean ao = a.getFileName().toString().startsWith(fileId + "_o");
                            boolean bo = b.getFileName().toString().startsWith(fileId + "_o");
                            return Boolean.compare(!ao, !bo);
                        })
                        .findFirst()
                        .orElse(null);
                if (found != null) return found;
            } catch (IOException ignored) {
                // Try the next legacy upload root.
            }
        }
        throw new BizException("WPS 文件不存在");
    }

    /** Extract the stable UUID portion from an uploaded chat attachment filename. */
    public String webOfficeFileId(String filename) {
        String safe = sanitizeStoredName(filename);
        int marker = safe.indexOf("_o");
        if (marker < 0) marker = safe.indexOf("_src");
        String id = marker > 0 ? safe.substring(0, marker) : "";
        if (!id.matches("[A-Za-z0-9]{32}")) throw new BizException("WPS 文件标识无效");
        return id;
    }

    /** Build a compact rendition for historical avatars that still point at full-size uploads. */
    public Path resolveAvatarPath(String filename) {
        Path source = resolveRawPath(filename);
        String sourceName = source.getFileName().toString();
        int dot = sourceName.lastIndexOf('.');
        String stem = dot > 0 ? sourceName.substring(0, dot) : sourceName;
        Path target = resolveUploadRoot().resolve(stem + "_avatar.jpg").normalize();
        Object lock = avatarLocks.computeIfAbsent(stem, key -> new Object());
        synchronized (lock) {
            try {
                if (Files.isRegularFile(target)
                        && Files.getLastModifiedTime(target).toMillis() >= Files.getLastModifiedTime(source).toMillis()) {
                    return target;
                }
                System.setProperty("java.awt.headless", "true");
                java.awt.image.BufferedImage src = javax.imageio.ImageIO.read(source.toFile());
                if (src == null || src.getWidth() <= 0 || src.getHeight() <= 0) {
                    return source;
                }
                int maxEdge = 256;
                double scale = Math.min(1.0, (double) maxEdge / Math.max(src.getWidth(), src.getHeight()));
                int width = Math.max(1, (int) Math.round(src.getWidth() * scale));
                int height = Math.max(1, (int) Math.round(src.getHeight() * scale));
                java.awt.image.BufferedImage output =
                        new java.awt.image.BufferedImage(width, height, java.awt.image.BufferedImage.TYPE_INT_RGB);
                java.awt.Graphics2D graphics = output.createGraphics();
                graphics.setRenderingHint(
                        java.awt.RenderingHints.KEY_INTERPOLATION,
                        java.awt.RenderingHints.VALUE_INTERPOLATION_BILINEAR
                );
                graphics.setColor(java.awt.Color.WHITE);
                graphics.fillRect(0, 0, width, height);
                graphics.drawImage(src, 0, 0, width, height, null);
                graphics.dispose();
                writeCompressedJpeg(output, target, 0.82f);
                return Files.isRegularFile(target) ? target : source;
            } catch (Exception ex) {
                log.warn("create avatar rendition failed for {}: {}", sourceName, ex.toString());
                return source;
            } finally {
                avatarLocks.remove(stem, lock);
            }
        }
    }

    /** 预热本地图片的 256px 头像缓存，供客户端高密度显示。 */
    public int warmAvatarThumbs(int limit) {
        Path root = resolveUploadRoot();
        if (!Files.isDirectory(root)) {
            return 0;
        }
        int max = Math.max(1, Math.min(limit <= 0 ? 500 : limit, 5000));
        int created = 0;
        try (var stream = Files.list(root)) {
            for (Path path : stream.limit(max * 2L).toList()) {
                if (created >= max) break;
                if (!Files.isRegularFile(path)) continue;
                String name = path.getFileName().toString();
                String lower = name.toLowerCase(Locale.ROOT);
                if (lower.endsWith("_avatar.jpg") || lower.contains("_o.") || lower.endsWith(".mp4")
                        || lower.endsWith(".webm") || lower.endsWith(".m4a") || lower.endsWith(".wav")
                        || lower.endsWith(".pdf") || lower.endsWith(".aac") || lower.endsWith(".ogg")) {
                    continue;
                }
                if (!(lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png")
                        || lower.endsWith(".webp") || lower.endsWith(".bmp") || lower.endsWith(".gif"))) {
                    continue;
                }
                try {
                    Path out = resolveAvatarPath(name);
                    if (out != null && out.getFileName().toString().endsWith("_avatar.jpg")) {
                        created++;
                    }
                } catch (Exception ex) {
                    log.debug("warm avatar skip {}: {}", name, ex.toString());
                }
            }
        } catch (IOException e) {
            log.warn("warm avatar thumbs failed: {}", e.toString());
        }
        log.info("Avatar thumb warm complete, generated/ensured={}", created);
        return created;
    }

    public Resource loadRawFile(String filename) {
        return new FileSystemResource(resolveRawPath(filename));
    }

    public String detectContentType(String filename) {
        String safe = sanitizeStoredName(filename);
        int dot = safe.lastIndexOf('.');
        String ext = dot >= 0 ? safe.substring(dot).toLowerCase(Locale.ROOT) : "";
        // 安卓浏览器对 video/quicktime 支持差；.mov 里多数是 H.264，按 mp4 返回更易播
        if (".mov".equals(ext) || ".m4v".equals(ext)) {
            return "video/mp4";
        }
        return guessContentType(ext);
    }

    /**
     * 将已上传的语音转为 16kHz 单声道 WAV，供前端 Whisper 解码。
     * 浏览器对 MediaRecorder 的 webm/opus 常无法 decodeAudioData。
     */
    public byte[] convertRawToWav16k(Long userId, String filename) {
        checkAudioRateLimit(userId, "wav", WAV_PER_MINUTE_LIMIT);
        Path src = resolveRawPath(filename);
        return runFfmpegToWav16k(src);
    }

    /** Converts an already materialized private chat attachment to WAV. */
    public byte[] convertPathToWav16k(Long userId, Path source) {
        checkAudioRateLimit(userId, "wav", WAV_PER_MINUTE_LIMIT);
        if (source == null || !Files.isRegularFile(source)) {
            throw new BizException("语音文件不存在");
        }
        return runFfmpegToWav16k(source);
    }

    /**
     * 语音转文字：ffmpeg → wav → Node Whisper。
     * 返回识别文本（可能为空串）。
     */
    public String transcribeRawFile(Long userId, String filename) {
        checkAudioRateLimit(userId, "asr", ASR_PER_MINUTE_LIMIT);
        return transcribeSource(resolveRawPath(filename));
    }

    /** Transcribes a materialized private chat attachment without exposing its bytes in JSON. */
    public String transcribePath(Long userId, Path source) {
        checkAudioRateLimit(userId, "asr", ASR_PER_MINUTE_LIMIT);
        if (source == null || !Files.isRegularFile(source)) {
            throw new BizException("语音文件不存在");
        }
        return transcribeSource(source);
    }

    private String transcribeSource(Path src) {
        Path wav = null;
        try {
            byte[] wavBytes = runFfmpegToWav16k(src);
            Path root = resolveUploadRoot().resolve("tmp-asr");
            Files.createDirectories(root);
            wav = root.resolve(UUID.randomUUID().toString().replace("-", "") + ".wav");
            Files.write(wav, wavBytes);
            return runNodeWhisper(wav);
        } catch (BizException e) {
            throw e;
        } catch (Exception e) {
            log.warn("transcribe failed: {}", e.toString());
            throw new BizException("语音识别失败，请重试");
        } finally {
            if (wav != null) {
                try {
                    Files.deleteIfExists(wav);
                } catch (IOException ignored) {
                    /* ignore */
                }
            }
        }
    }

    private String runNodeWhisper(Path wav) {
        // 1) 优先常驻 ASR 服务（whisper 常驻内存，更快更准）
        String endpoint = StringUtils.hasText(asrUrl) ? asrUrl.trim() : "http://127.0.0.1:3978/transcribe";
        try {
            byte[] wavBytes = Files.readAllBytes(wav);
            java.net.HttpURLConnection conn = (java.net.HttpURLConnection)
                    new java.net.URI(endpoint).toURL().openConnection();
            conn.setConnectTimeout(1500);
            conn.setReadTimeout(180_000);
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/octet-stream");
            conn.setFixedLengthStreamingMode(wavBytes.length);
            try (java.io.OutputStream os = conn.getOutputStream()) {
                os.write(wavBytes);
            }
            int code = conn.getResponseCode();
            java.io.InputStream in = code >= 200 && code < 300 ? conn.getInputStream() : conn.getErrorStream();
            String out = in == null ? "" : new String(in.readAllBytes(), StandardCharsets.UTF_8).trim();
            if (code >= 200 && code < 300) {
                String text = extractJsonString(out, "text");
                if (text != null) return text.trim();
            }
            log.warn("asr http failed status={} body={}", code,
                    out.length() > 200 ? out.substring(0, 200) : out);
        } catch (Exception e) {
            log.info("asr http unavailable ({}), fallback to node cli: {}", endpoint, e.toString());
        }

        // 2) 回退：临时拉起 node 脚本
        String node = resolveNodeBinary();
        Path script = resolveAsrScript();
        if (!Files.isRegularFile(script)) {
            throw new BizException("识别服务未配置");
        }
        try {
            ProcessBuilder pb = new ProcessBuilder(
                    node,
                    script.toAbsolutePath().toString(),
                    wav.toAbsolutePath().toString()
            );
            pb.redirectErrorStream(true);
            pb.directory(script.getParent() != null ? script.getParent().toFile() : null);
            Process p = pb.start();
            String out = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim();
            boolean finished = p.waitFor(240, TimeUnit.SECONDS);
            if (!finished) {
                p.destroyForcibly();
                throw new BizException("语音识别超时");
            }
            String jsonLine = out;
            int brace = out.lastIndexOf('{');
            if (brace >= 0) {
                jsonLine = out.substring(brace);
            }
            if (!StringUtils.hasText(jsonLine) || !jsonLine.startsWith("{")) {
                log.warn("asr empty output: {}", out.length() > 300 ? out.substring(out.length() - 300) : out);
                throw new BizException("语音识别失败");
            }
            String text = extractJsonString(jsonLine, "text");
            String error = extractJsonString(jsonLine, "error");
            if (StringUtils.hasText(error) && !StringUtils.hasText(text)) {
                log.warn("asr error: {}", error);
                throw new BizException("语音识别失败");
            }
            return text == null ? "" : text.trim();
        } catch (BizException e) {
            throw e;
        } catch (Exception e) {
            log.warn("asr process failed: {}", e.toString());
            throw new BizException("语音识别失败");
        }
    }

    private static String extractJsonString(String json, String key) {
        String pattern = "\"" + key + "\"";
        int i = json.indexOf(pattern);
        if (i < 0) return null;
        int colon = json.indexOf(':', i + pattern.length());
        if (colon < 0) return null;
        int startQuote = json.indexOf('"', colon + 1);
        if (startQuote < 0) return null;
        StringBuilder sb = new StringBuilder();
        for (int p = startQuote + 1; p < json.length(); p++) {
            char c = json.charAt(p);
            if (c == '\\' && p + 1 < json.length()) {
                sb.append(json.charAt(p + 1));
                p++;
                continue;
            }
            if (c == '"') break;
            sb.append(c);
        }
        return sb.toString();
    }

    private String resolveNodeBinary() {
        if (StringUtils.hasText(System.getenv("NODE_PATH"))) {
            Path p = Paths.get(System.getenv("NODE_PATH"));
            if (Files.isRegularFile(p)) return p.toAbsolutePath().toString();
        }
        Path[] candidates = new Path[] {
                Paths.get("D:/node.js/node.exe"),
                Paths.get("C:/Program Files/nodejs/node.exe"),
                Paths.get(System.getProperty("user.home"), "AppData/Local/Programs/nodejs/node.exe"),
        };
        for (Path c : candidates) {
            try {
                if (Files.isRegularFile(c)) return c.toAbsolutePath().toString();
            } catch (Exception ignored) {
                /* next */
            }
        }
        return "node";
    }

    private Path resolveAsrScript() {
        Path[] candidates = new Path[] {
                Paths.get("E:/Desk/PulseIM（脉冲）/tools/asr/transcribe.mjs"),
                Paths.get(System.getProperty("user.dir")).resolve("tools/asr/transcribe.mjs"),
                Paths.get(System.getProperty("user.dir")).resolve("../tools/asr/transcribe.mjs"),
                Paths.get(System.getProperty("user.dir")).resolve("../../tools/asr/transcribe.mjs"),
                Paths.get(System.getProperty("user.dir")).resolve("../../../tools/asr/transcribe.mjs"),
        };
        for (Path c : candidates) {
            try {
                Path n = c.normalize().toAbsolutePath();
                if (Files.isRegularFile(n)) return n;
            } catch (Exception ignored) {
                /* next */
            }
        }
        return candidates[0];
    }

    /** 上传临时语音并转为 16kHz 单声道 WAV */
    public byte[] convertUploadToWav16k(Long userId, MultipartFile file) {
        checkAudioRateLimit(userId, "wav", WAV_PER_MINUTE_LIMIT);
        if (file == null || file.isEmpty()) {
            throw new BizException("文件不能为空");
        }
        if (file.getSize() > 20L * 1024 * 1024) {
            throw new BizException("语音文件过大");
        }
        String original = file.getOriginalFilename();
        String ext = ".webm";
        if (StringUtils.hasText(original)) {
            int dot = original.lastIndexOf('.');
            if (dot >= 0 && dot < original.length() - 1) {
                String e = original.substring(dot).toLowerCase(Locale.ROOT);
                if (e.length() <= 8) ext = e;
            }
        }
        Path tmp = null;
        try {
            Path root = resolveUploadRoot().resolve("tmp-asr");
            Files.createDirectories(root);
            tmp = root.resolve(UUID.randomUUID().toString().replace("-", "") + ext);
            file.transferTo(tmp);
            return runFfmpegToWav16k(tmp);
        } catch (BizException e) {
            throw e;
        } catch (IOException e) {
            throw new BizException("语音转码失败: " + e.getMessage());
        } finally {
            if (tmp != null) {
                try {
                    Files.deleteIfExists(tmp);
                } catch (IOException ignored) {
                    /* ignore */
                }
            }
        }
    }

    private byte[] runFfmpegToWav16k(Path source) {
        String ffmpeg = resolveFfmpegBinary();
        Path out = null;
        try {
            out = Files.createTempFile("pulse-asr-", ".wav");
            ProcessBuilder pb = new ProcessBuilder(
                    ffmpeg,
                    "-y",
                    "-i", source.toAbsolutePath().toString(),
                    "-vn",
                    "-ac", "1",
                    "-ar", "16000",
                    "-c:a", "pcm_s16le",
                    out.toAbsolutePath().toString()
            );
            pb.redirectErrorStream(true);
            Process p = pb.start();
            String logTail = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            boolean finished = p.waitFor(60, TimeUnit.SECONDS);
            if (!finished) {
                p.destroyForcibly();
                throw new BizException("语音转码超时");
            }
            if (p.exitValue() != 0 || !Files.isRegularFile(out) || Files.size(out) < 44) {
                log.warn("ffmpeg wav failed for {}: {}", source.getFileName(),
                        logTail.length() > 400 ? logTail.substring(logTail.length() - 400) : logTail);
                throw new BizException("语音转码失败");
            }
            return Files.readAllBytes(out);
        } catch (BizException e) {
            throw e;
        } catch (Exception ex) {
            log.warn("ffmpeg wav error: {}", ex.toString());
            throw new BizException("语音转码失败");
        } finally {
            if (out != null) {
                try {
                    Files.deleteIfExists(out);
                } catch (IOException ignored) {
                    /* ignore */
                }
            }
        }
    }

    private Path resolveUploadRoot() {
        if (uploadRoot != null) {
            return uploadRoot;
        }
        return resolveConfiguredRoot();
    }

    private Path resolveConfiguredRoot() {
        if (StringUtils.hasText(uploadDir)) {
            Path configured = Paths.get(uploadDir.trim());
            if (configured.isAbsolute()) {
                return configured.normalize();
            }
        }
        // 相对路径：优先落到稳定目录，避免 jar 启动 cwd 变化导致头像 404
        Path homeRoot = Paths.get(System.getProperty("user.home"), ".pulseim", "uploads")
                .toAbsolutePath()
                .normalize();
        Path richest = pickRichestExistingUploadsDir();
        if (richest != null) {
            return richest;
        }
        return homeRoot;
    }

    private Path pickRichestExistingUploadsDir() {
        Path best = null;
        long bestCount = -1;
        for (Path candidate : candidateUploadRoots()) {
            if (!Files.isDirectory(candidate)) {
                continue;
            }
            long count = 0;
            try (var stream = Files.list(candidate)) {
                count = stream.filter(Files::isRegularFile).count();
            } catch (Exception ignored) {
                continue;
            }
            if (count > bestCount) {
                bestCount = count;
                best = candidate;
            }
        }
        return best;
    }

    private java.util.List<Path> legacyUploadRoots() {
        java.util.LinkedHashSet<Path> set = new java.util.LinkedHashSet<>();
        Path primary = resolveUploadRoot();
        for (Path p : candidateUploadRoots()) {
            if (!p.equals(primary)) {
                set.add(p);
            }
        }
        return new java.util.ArrayList<>(set);
    }

    private java.util.List<Path> candidateUploadRoots() {
        java.util.LinkedHashSet<Path> set = new java.util.LinkedHashSet<>();
        // 当前相对路径（兼容旧行为）
        set.add(Paths.get(StringUtils.hasText(uploadDir) ? uploadDir.trim() : "uploads")
                .toAbsolutePath().normalize());
        set.add(Paths.get(System.getProperty("user.home"), ".pulseim", "uploads")
                .toAbsolutePath().normalize());
        // 常见工程内历史目录
        String[] relatives = {
                "uploads",
                "backend/uploads",
                "pulse-api/uploads",
                "pulse-api/target/uploads",
                "../uploads",
                "../../uploads",
                "../pulse-api/uploads",
                "../pulse-api/target/uploads",
        };
        Path cwd = Paths.get("").toAbsolutePath().normalize();
        for (String rel : relatives) {
            set.add(cwd.resolve(rel).normalize());
        }
        // 若 ffmpeg 路径在本仓库 tools 下，反推仓库根
        if (StringUtils.hasText(ffmpegPath)) {
            try {
                Path ff = Paths.get(ffmpegPath).toAbsolutePath().normalize();
                Path tools = ff;
                for (int i = 0; i < 8 && tools != null; i++) {
                    if ("tools".equalsIgnoreCase(String.valueOf(tools.getFileName()))) {
                        Path repo = tools.getParent();
                        if (repo != null) {
                            set.add(repo.resolve("backend/uploads").normalize());
                            set.add(repo.resolve("backend/pulse-api/uploads").normalize());
                            set.add(repo.resolve("backend/pulse-api/target/uploads").normalize());
                        }
                        break;
                    }
                    tools = tools.getParent();
                }
            } catch (Exception ignored) {
                // ignore
            }
        }
        return new java.util.ArrayList<>(set);
    }

    private String sanitizeFileName(String name) {
        if (!StringUtils.hasText(name)) {
            return "file";
        }
        String n = name.replace("\\", "/");
        int slash = n.lastIndexOf('/');
        if (slash >= 0) n = n.substring(slash + 1);
        // Stored files use a random ASCII id; this name is only metadata and
        // extension input, so keep Unicode letters/numbers for cross-platform
        // filename display instead of replacing non-Chinese characters.
        n = n.replaceAll("[^\\p{L}\\p{N}._\\- ]", "_");
        if (!StringUtils.hasText(n)) return "file";
        return n.length() > 80 ? n.substring(n.length() - 80) : n;
    }

    /** 修复 multipart header 中常见的 UTF-8 -> ISO-8859-1 文件名错解码。 */
    private String normalizeClientFilename(String name) {
        if (!StringUtils.hasText(name)) return "";
        String value = name.replace('\\', '/');
        int slash = value.lastIndexOf('/');
        if (slash >= 0) value = value.substring(slash + 1);
        value = value.replaceAll("[\\u0000-\\u001f\\u007f]", "").trim();
        if (value.isEmpty()) return "";
        return decodeMojibakeSegments(value);
    }

    private String decodeMojibakeSegments(String value) {
        StringBuilder result = new StringBuilder(value.length());
        int index = 0;
        while (index < value.length()) {
            int firstByte = windows1252Byte(value.charAt(index));
            if (firstByte < 0) {
                result.append(value.charAt(index++));
                continue;
            }
            int end = index + 1;
            while (end < value.length() && windows1252Byte(value.charAt(end)) >= 0) end++;
            String segment = value.substring(index, end);
            String decodedSegment = segment;
            try {
                byte[] bytes = new byte[segment.length()];
                for (int i = 0; i < segment.length(); i++) {
                    bytes[i] = (byte) windows1252Byte(segment.charAt(i));
                }
                String decoded = new String(bytes, StandardCharsets.UTF_8);
                if (decoded.indexOf('\ufffd') < 0
                        && !decoded.equals(segment)
                        && (countCjk(decoded) > countCjk(segment)
                        || suspiciousFilenameChars(decoded) < suspiciousFilenameChars(segment))) {
                    decodedSegment = decoded;
                }
            } catch (Exception ignored) {
                // 正常的 Latin-1/Windows-1252 文件名不是 UTF-8，保持原样。
            }
            result.append(decodedSegment);
            index = end;
        }
        return java.text.Normalizer.normalize(result.toString(), java.text.Normalizer.Form.NFC);
    }

    private static int countCjk(String value) {
        int count = 0;
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c >= '\u3400' && c <= '\u9fff') count++;
        }
        return count;
    }

    private static boolean containsCjk(String value) {
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c >= '\u3400' && c <= '\u9fff') return true;
        }
        return false;
    }

    private static int suspiciousFilenameChars(String value) {
        int count = 0;
        for (int i = 0; i < value.length(); i++) {
            if ("ÃÂâäåæçèéêëïöøù".indexOf(value.charAt(i)) >= 0) count++;
        }
        return count;
    }

    private static int windows1252Byte(char c) {
        if (c <= 0xff) return c;
        return switch (c) {
            case '\u20ac' -> 0x80;
            case '\u201a' -> 0x82;
            case '\u0192' -> 0x83;
            case '\u201e' -> 0x84;
            case '\u2026' -> 0x85;
            case '\u2020' -> 0x86;
            case '\u2021' -> 0x87;
            case '\u02c6' -> 0x88;
            case '\u2030' -> 0x89;
            case '\u0160' -> 0x8a;
            case '\u2039' -> 0x8b;
            case '\u0152' -> 0x8c;
            case '\u017d' -> 0x8e;
            case '\u2018' -> 0x91;
            case '\u2019' -> 0x92;
            case '\u201c' -> 0x93;
            case '\u201d' -> 0x94;
            case '\u2022' -> 0x95;
            case '\u2013' -> 0x96;
            case '\u2014' -> 0x97;
            case '\u02dc' -> 0x98;
            case '\u2122' -> 0x99;
            case '\u0161' -> 0x9a;
            case '\u203a' -> 0x9b;
            case '\u0153' -> 0x9c;
            case '\u017e' -> 0x9e;
            case '\u0178' -> 0x9f;
            default -> -1;
        };
    }

    private String sanitizeStoredName(String filename) {
        if (!StringUtils.hasText(filename) || filename.contains("..") || filename.contains("/") || filename.contains("\\")) {
            throw new BizException("非法文件名");
        }
        if (!filename.matches("^[a-zA-Z0-9._\\-]+$")) {
            throw new BizException("非法文件名");
        }
        return filename;
    }

    private String guessExt(String contentType) {
        if (contentType == null) {
            return ".jpg";
        }
        String ct = contentType.toLowerCase(Locale.ROOT);
        return switch (ct) {
            case "image/png" -> ".png";
            case "image/webp" -> ".webp";
            case "image/gif" -> ".gif";
            case "video/mp4" -> ".mp4";
            case "video/webm" -> ".webm";
            case "video/quicktime" -> ".mov";
            case "video/x-m4v" -> ".m4v";
            case "audio/mpeg" -> ".mp3";
            case "audio/mp4", "audio/m4a" -> ".m4a";
            case "audio/aac" -> ".aac";
            case "audio/ogg", "audio/opus" -> ".ogg";
            case "audio/wav" -> ".wav";
            default -> {
                if (ct.startsWith("video/")) yield ".mp4";
                if (ct.startsWith("audio/")) yield ".m4a";
                yield ".jpg";
            }
        };
    }

    private String guessContentType(String ext) {
        return switch (ext) {
            case ".png" -> MediaType.IMAGE_PNG_VALUE;
            case ".gif" -> MediaType.IMAGE_GIF_VALUE;
            case ".webp" -> "image/webp";
            case ".jpg", ".jpeg" -> MediaType.IMAGE_JPEG_VALUE;
            case ".pdf" -> MediaType.APPLICATION_PDF_VALUE;
            case ".doc" -> "application/msword";
            case ".docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            case ".dot" -> "application/msword";
            case ".dotx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.template";
            case ".xls" -> "application/vnd.ms-excel";
            case ".xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            case ".xlsm" -> "application/vnd.ms-excel.sheet.macroEnabled.12";
            case ".xlt" -> "application/vnd.ms-excel";
            case ".ppt" -> "application/vnd.ms-powerpoint";
            case ".pptx" -> "application/vnd.openxmlformats-officedocument.presentationml.presentation";
            case ".pps" -> "application/vnd.ms-powerpoint";
            case ".ppsx" -> "application/vnd.openxmlformats-officedocument.presentationml.slideshow";
            case ".odt" -> "application/vnd.oasis.opendocument.text";
            case ".ods" -> "application/vnd.oasis.opendocument.spreadsheet";
            case ".odp" -> "application/vnd.oasis.opendocument.presentation";
            case ".txt" -> MediaType.TEXT_PLAIN_VALUE;
            case ".json" -> MediaType.APPLICATION_JSON_VALUE;
            case ".apk" -> "application/vnd.android.package-archive";
            case ".ipa" -> "application/octet-stream";
            case ".exe" -> "application/vnd.microsoft.portable-executable";
            case ".mp4" -> "video/mp4";
            case ".webm" -> "audio/webm";
            case ".mov" -> "video/quicktime";
            case ".m4v" -> "video/x-m4v";
            case ".mp3" -> "audio/mpeg";
            case ".m4a" -> "audio/mp4";
            case ".aac" -> "audio/aac";
            case ".ogg", ".opus" -> "audio/ogg";
            case ".wav" -> "audio/wav";
            default -> MediaType.APPLICATION_OCTET_STREAM_VALUE;
        };
    }

    private boolean looksLikeHevc(Path file) {
        try (InputStream in = Files.newInputStream(file)) {
            byte[] buf = in.readNBytes(2 * 1024 * 1024);
            String text = new String(buf, StandardCharsets.ISO_8859_1);
            return text.contains("hvc1") || text.contains("hev1") || text.contains("hvcC");
        } catch (Exception e) {
            return false;
        }
    }

    /** 语音识别 / 转码属于重 CPU 操作，按用户限流，避免被刷爆资源 */
    private void checkAudioRateLimit(Long userId, String bucket, int limit) {
        if (userId == null) {
            return;
        }
        String key = "pulse:ratelimit:" + bucket + ":" + userId;
        Long count = redis.opsForValue().increment(key);
        if (count != null && count == 1) {
            redis.expire(key, 60, TimeUnit.SECONDS);
        }
        if (count != null && count > limit) {
            throw new BizException("操作过于频繁，请稍后再试");
        }
    }

    private String resolveFfmpegBinary() {
        if (StringUtils.hasText(ffmpegPath)) {
            Path p = Paths.get(ffmpegPath.trim());
            if (Files.isRegularFile(p)) return p.toAbsolutePath().toString();
        }
        Path[] candidates = new Path[] {
                Paths.get("E:/Desk/PulseIM（脉冲）/tools/ffmpeg/node_modules/ffmpeg-static/ffmpeg.exe"),
                Paths.get(System.getProperty("user.dir")).resolve("tools/ffmpeg/node_modules/ffmpeg-static/ffmpeg.exe"),
                Paths.get(System.getProperty("user.dir")).resolve("../tools/ffmpeg/node_modules/ffmpeg-static/ffmpeg.exe"),
                Paths.get(System.getProperty("user.dir")).resolve("../../tools/ffmpeg/node_modules/ffmpeg-static/ffmpeg.exe"),
                Paths.get(System.getProperty("user.dir")).resolve("tools/ffmpeg/ffmpeg.exe"),
        };
        for (Path c : candidates) {
            try {
                Path n = c.normalize().toAbsolutePath();
                if (Files.isRegularFile(n)) return n.toString();
            } catch (Exception ignored) {
                /* next */
            }
        }
        return "ffmpeg";
    }

    /** HEVC 则转 H.264 MP4；失败返回 null 保留原文件 */
    private Path maybeTranscodeHevcToAvc(Path source, String ext) {
        String e = ext == null ? "" : ext.toLowerCase(Locale.ROOT);
        if (!(e.equals(".mp4") || e.equals(".mov") || e.equals(".m4v") || e.isEmpty())) {
            return null;
        }
        if (!looksLikeHevc(source)) {
            return null;
        }
        String ffmpeg = resolveFfmpegBinary();
        Path out = source.resolveSibling(UUID.randomUUID().toString().replace("-", "") + ".mp4");
        try {
            // 尽量保留清晰度：最长边 1440，CRF16
            ProcessBuilder pb = new ProcessBuilder(
                    ffmpeg,
                    "-y",
                    "-i", source.toAbsolutePath().toString(),
                    "-vf", "scale='min(2560,iw)':'min(1440,ih)':force_original_aspect_ratio=decrease:flags=lanczos",
                    "-c:v", "libx264",
                    "-preset", "slow",
                    "-crf", "16",
                    "-profile:v", "high",
                    "-level", "5.1",
                    "-pix_fmt", "yuv420p",
                    "-c:a", "aac",
                    "-b:a", "256k",
                    "-movflags", "+faststart",
                    out.toAbsolutePath().toString()
            );
            pb.redirectErrorStream(true);
            Process p = pb.start();
            String logTail = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            boolean finished = p.waitFor(180, TimeUnit.SECONDS);
            if (!finished) {
                p.destroyForcibly();
                Files.deleteIfExists(out);
                log.warn("ffmpeg timeout for {}", source.getFileName());
                return null;
            }
            if (p.exitValue() != 0 || !Files.isRegularFile(out) || Files.size(out) < 1024) {
                Files.deleteIfExists(out);
                log.warn("ffmpeg failed for {}: {}", source.getFileName(),
                        logTail.length() > 400 ? logTail.substring(logTail.length() - 400) : logTail);
                return null;
            }
            log.info("transcoded HEVC -> H.264: {} -> {}", source.getFileName(), out.getFileName());
            return out;
        } catch (Exception ex) {
            try {
                Files.deleteIfExists(out);
            } catch (IOException ignored) {
            }
            log.warn("ffmpeg not available or failed: {}", ex.toString());
            return null;
        }
    }
}
