package com.pulse.api.service;

import com.pulse.api.config.MinioProperties;
import com.pulse.api.entity.ImFile;
import com.pulse.api.mapper.ImFileMapper;
import com.pulse.api.vo.FileMetadataVO;
import com.pulse.common.exception.BizException;
import io.minio.GetObjectArgs;
import io.minio.GetObjectResponse;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.StatObjectArgs;
import io.minio.StatObjectResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.security.DigestInputStream;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * Chat attachment storage boundary.
 *
 * PostgreSQL stores only a small descriptor and MinIO stores every byte. The
 * HTTP controller uses this service for authenticated metadata and ranged
 * reads; WebSocket code never calls it and never sees a binary stream.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ChatFileStorageService {
    private static final ExecutorService VIDEO_RENDITION_EXECUTOR = Executors.newFixedThreadPool(2, runnable -> {
        Thread thread = new Thread(runnable, "pulse-chat-video-rendition");
        thread.setDaemon(true);
        return thread;
    });
    private static final int LIFECYCLE_BATCH_SIZE = 100;
    private final Set<String> videoRenditionInFlight = ConcurrentHashMap.newKeySet();

    private final MinioClient minioClient;
    private final MinioProperties minioProperties;
    private final FileConfigService fileConfigService;
    private final ImFileMapper fileMapper;
    private final JdbcTemplate jdbc;

    @Value("${pulse.ffmpeg.path:}")
    private String ffmpegPath;

    public Map<String, Object> upload(
            Long userId,
            MultipartFile multipart,
            String videoCodecHint,
            String requestedName
    ) {
        return upload(userId, multipart, videoCodecHint, requestedName, null);
    }

    public Map<String, Object> upload(
            Long userId,
            MultipartFile multipart,
            String videoCodecHint,
            String requestedName,
            Long durationMs
    ) {
        if (userId == null) throw new BizException("登录状态已失效");
        if (multipart == null || multipart.isEmpty()) throw new BizException("请选择文件");

        String name = sanitizeName(StringUtils.hasText(requestedName)
                ? requestedName : multipart.getOriginalFilename());
        if (!StringUtils.hasText(name)) name = "文件";
        String contentType = normalizeContentType(name, multipart.getContentType());
        fileConfigService.assertFileAllowed(name, contentType, multipart.getSize());

        String fileId = UUID.randomUUID().toString().replace("-", "");
        String extension = extensionOf(name);
        String objectKey = "chat/" + userId + "/" + fileId + "/original" + extension;
        String thumbKey = null;
        String previewKey = null;
        Path source = null;
        Path thumb = null;
        Path preview = null;
        Set<String> uploadedKeys = new LinkedHashSet<>();
        try {
            source = Files.createTempFile("pulse-chat-", extension.isBlank() ? ".bin" : extension);
            multipart.transferTo(source.toFile());
            long size = Files.size(source);
            String sha256 = sha256(source);

            Integer width = null;
            Integer height = null;
            if (contentType.startsWith("image/")) {
                BufferedImage image = ImageIO.read(source.toFile());
                if (image != null) {
                    width = image.getWidth();
                    height = image.getHeight();
                    thumb = createImageThumb(image);
                    thumbKey = "chat/" + userId + "/" + fileId + "/thumb.jpg";
                    preview = createImagePreview(image);
                    previewKey = "chat/" + userId + "/" + fileId + "/preview.jpg";
                }
            }

            uploadedKeys.add(objectKey);
            putObject(objectKey, source, contentType);
            if (thumb != null && thumbKey != null) {
                uploadedKeys.add(thumbKey);
                putObject(thumbKey, thumb, "image/jpeg");
            }
            if (preview != null && previewKey != null) {
                uploadedKeys.add(previewKey);
                putObject(previewKey, preview, contentType.startsWith("video/") ? "video/mp4" : "image/jpeg");
            }

            OffsetDateTime now = OffsetDateTime.now();
            ImFile entity = new ImFile();
            entity.setFileId(fileId);
            entity.setUploaderId(userId);
            entity.setObjectKey(objectKey);
            entity.setThumbObjectKey(thumbKey);
            entity.setPreviewObjectKey(previewKey);
            entity.setOriginalName(name);
            entity.setContentType(contentType);
            entity.setSizeBytes(size);
            entity.setSha256(sha256);
            entity.setWidth(width);
            entity.setHeight(height);
            entity.setDurationMs(durationMs == null ? null : Math.max(0L, Math.min(durationMs, 86_400_000L)));
            entity.setStatus("READY");
            entity.setCreatedAt(now);
            entity.setUpdatedAt(now);
            fileMapper.insert(entity);
            // Video transcoding is intentionally outside the upload request.
            // The original file is immediately usable, while thumbnail and
            // compressed-video metadata appear as the background job finishes.
            if (contentType.startsWith("video/")) {
                scheduleVideoRenditions(entity);
            }
            return metadataMap(entity);
        } catch (BizException e) {
            deleteUploadedObjects(uploadedKeys);
            throw e;
        } catch (Exception e) {
            deleteUploadedObjects(uploadedKeys);
            log.error("chat file upload failed fileId={} codecHint={}", fileId, videoCodecHint, e);
            throw new BizException("文件上传失败，请重试");
        } finally {
            deleteQuietly(source);
            deleteQuietly(thumb);
            deleteQuietly(preview);
        }
    }

    public FileMetadataVO metadata(Long userId, String fileId) {
        return toMetadata(requireReadable(userId, fileId));
    }

    public ImFile requireReadable(Long userId, String fileId) {
        if (userId == null || !StringUtils.hasText(fileId)) throw new BizException("文件不存在");
        ImFile file = fileMapper.selectById(fileId.trim());
        if (file == null || !"READY".equalsIgnoreCase(file.getStatus())) throw new BizException("文件不存在");
        if (userId.equals(file.getUploaderId())) return file;
        Integer visible = jdbc.queryForObject("""
                SELECT COUNT(*)
                FROM im_message m
                JOIN im_conversation_member cm ON cm.conversation_id = m.conversation_id
                WHERE m.file_id = ? AND cm.user_id = ?
                  AND COALESCE(m.recalled, FALSE) = FALSE
                  AND (m.burn_expires_at IS NULL OR m.burn_expires_at > NOW())
                  AND (m.auto_delete_expires_at IS NULL OR m.auto_delete_expires_at > NOW())
                  AND NOT EXISTS (
                    SELECT 1 FROM im_message_hide h
                    WHERE h.user_id = ? AND h.msg_id = m.msg_id
                  )
                """, Integer.class, file.getFileId(), userId, userId);
        if (visible != null && visible > 0) return file;

        // 动态媒体也使用同一份 im_file。它不一定有 im_message 引用，
        // 但只能由动态的可见范围/圈子成员权限打开，不能因为 URL 被猜到
        // 就绕过朋友圈和圈子权限。
        if (hasVisibleMomentReference(file.getFileId(), userId)
                || hasVisibleCoverReference(file.getFileId())
                || hasVisibleCommunityReference(file.getFileId(), userId)
                || hasFavoriteReference(file.getFileId(), userId)) {
            return file;
        }
        throw new BizException("无权访问该文件");
    }

    /**
     * Upload-before-send can leave an otherwise valid object without a business
     * reference. Reclaim only old, unreferenced files on the server; this is
     * deliberately independent from the client cache-clear APIs.
     */
    @Scheduled(
            fixedDelayString = "${pulse.file.lifecycle-interval-ms:3600000}",
            initialDelayString = "${pulse.file.lifecycle-initial-delay-ms:300000}"
    )
    public void purgeUnreferencedFiles() {
        List<String> fileIds = jdbc.queryForList("""
                SELECT f.file_id
                FROM im_file f
                WHERE f.created_at < NOW() - INTERVAL '24 hours'
                  AND NOT EXISTS (
                      SELECT 1 FROM im_message m
                      WHERE m.file_id = f.file_id
                         OR POSITION(f.file_id IN COALESCE(m.content, '')) > 0
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM im_favorite fav
                    WHERE fav.file_id = f.file_id
                       OR (',' || COALESCE(fav.media_file_ids, '') || ',') LIKE '%,' || f.file_id || ',%'
                  )
                   AND NOT EXISTS (
                       SELECT 1 FROM moment_post p
                       WHERE (',' || COALESCE(p.media_file_ids, '') || ',') LIKE '%,' || f.file_id || ',%'
                          OR POSITION(f.file_id IN COALESCE(p.images, '')) > 0
                          OR POSITION(f.file_id IN COALESCE(p.original_images, '')) > 0
                   )
                  AND NOT EXISTS (
                    SELECT 1 FROM moment_comment mc WHERE mc.image_file_id = f.file_id
                  )
                   AND NOT EXISTS (
                       SELECT 1 FROM community_post cp
                    WHERE (',' || COALESCE(cp.media_file_ids, '') || ',') LIKE '%,' || f.file_id || ',%'
                       OR (',' || COALESCE(cp.quoted_media_file_ids, '') || ',') LIKE '%,' || f.file_id || ',%'
                   )
                   AND NOT EXISTS (
                       SELECT 1 FROM sys_user u
                       WHERE u.avatar_url LIKE '%/files/' || f.file_id || '/%'
                          OR u.moments_cover_url LIKE '%/files/' || f.file_id || '/%'
                   )
                   AND NOT EXISTS (
                       SELECT 1 FROM sys_admin a
                       WHERE a.avatar_url LIKE '%/files/' || f.file_id || '/%'
                   )
                 ORDER BY f.created_at
                LIMIT ?
                """, String.class, LIFECYCLE_BATCH_SIZE);
        for (String fileId : fileIds) {
            try {
                purgeUnreferencedFile(fileId);
            } catch (Exception error) {
                log.warn("unreferenced file cleanup failed fileId={}: {}", fileId, error.getMessage());
            }
        }
    }

    private void purgeUnreferencedFile(String fileId) throws Exception {
        Map<String, Object> row = jdbc.queryForMap("""
                SELECT file_id, object_key, thumb_object_key, preview_object_key
                FROM im_file f
                WHERE f.file_id = ?
                  AND f.created_at < NOW() - INTERVAL '24 hours'
                  AND NOT EXISTS (
                      SELECT 1 FROM im_message m
                      WHERE m.file_id = f.file_id
                         OR POSITION(f.file_id IN COALESCE(m.content, '')) > 0
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM im_favorite fav
                    WHERE fav.file_id = f.file_id
                       OR (',' || COALESCE(fav.media_file_ids, '') || ',') LIKE '%,' || f.file_id || ',%'
                  )
                   AND NOT EXISTS (
                     SELECT 1 FROM moment_post p
                     WHERE (',' || COALESCE(p.media_file_ids, '') || ',') LIKE '%,' || f.file_id || ',%'
                        OR POSITION(f.file_id IN COALESCE(p.images, '')) > 0
                        OR POSITION(f.file_id IN COALESCE(p.original_images, '')) > 0
                   )
                  AND NOT EXISTS (SELECT 1 FROM moment_comment mc WHERE mc.image_file_id = f.file_id)
            AND NOT EXISTS (
                SELECT 1 FROM community_post cp
                    WHERE (',' || COALESCE(cp.media_file_ids, '') || ',') LIKE '%,' || f.file_id || ',%'
                OR (',' || COALESCE(cp.quoted_media_file_ids, '') || ',') LIKE '%,' || f.file_id || ',%'
            )
            AND NOT EXISTS (
                SELECT 1 FROM sys_user u
                WHERE u.avatar_url LIKE '%/files/' || f.file_id || '/%'
                   OR u.moments_cover_url LIKE '%/files/' || f.file_id || '/%'
            )
            AND NOT EXISTS (
                SELECT 1 FROM sys_admin a
                WHERE a.avatar_url LIKE '%/files/' || f.file_id || '/%'
            )
            """, fileId);
        Set<String> keys = new LinkedHashSet<>();
        for (String column : List.of("object_key", "thumb_object_key", "preview_object_key")) {
            Object value = row.get(column);
            if (value != null && StringUtils.hasText(String.valueOf(value))) keys.add(String.valueOf(value));
        }
        for (String key : keys) {
            minioClient.removeObject(RemoveObjectArgs.builder().bucket(fileBucket()).object(key).build());
        }
        jdbc.update("DELETE FROM im_file WHERE file_id = ?", fileId);
        log.info("purged unreferenced chat file fileId={}", fileId);
    }

    private boolean hasVisibleMomentReference(String fileId, Long viewerId) {
        Integer count = jdbc.queryForObject("""
                SELECT COUNT(*)
                FROM moment_post p
                JOIN sys_user author ON author.id = p.user_id
                  WHERE (
                     (',' || COALESCE(p.media_file_ids, '') || ',') LIKE '%,' || ? || ',%'
                     OR EXISTS (
                         SELECT 1 FROM moment_comment mc
                         WHERE mc.post_id = p.id AND mc.image_file_id = ?
                     )
                     OR POSITION(? IN COALESCE(p.images, '')) > 0
                     OR POSITION(? IN COALESCE(p.original_images, '')) > 0
                  )
                  AND COALESCE(p.removed, FALSE) = FALSE
                  AND (
                    p.user_id = ?
                    OR (
                      NOT EXISTS (
                        SELECT 1 FROM im_user_block b
                        WHERE (b.user_id = ? AND b.blocked_user_id = p.user_id)
                           OR (b.user_id = p.user_id AND b.blocked_user_id = ?)
                      )
                      AND NOT EXISTS (
                        SELECT 1 FROM im_friend f
                        WHERE f.user_id = ? AND f.friend_id = p.user_id AND f.hide_his_moments = TRUE
                      )
                      AND NOT EXISTS (
                        SELECT 1 FROM im_friend f
                        WHERE f.user_id = p.user_id AND f.friend_id = ? AND f.reject_his_moments = TRUE
                      )
                      AND (
                        (COALESCE(p.visibility, 0) = 2
                          AND (',' || COALESCE(p.visible_user_ids, '') || ',') LIKE '%,' || ? || ',%')
                        OR (COALESCE(p.visibility, 0) = 0 AND (
                          EXISTS (SELECT 1 FROM im_friend f WHERE f.user_id = ? AND f.friend_id = p.user_id)
                          OR (
                            COALESCE(author.moments_stranger_ten, FALSE) = TRUE
                            AND (
                              SELECT COUNT(*)
                              FROM moment_post newer
                              WHERE newer.user_id = p.user_id
                                AND COALESCE(newer.removed, FALSE) = FALSE
                                AND COALESCE(newer.visibility, 0) = 0
                                AND (
                                  p.created_at IS NULL
                                  OR newer.created_at > p.created_at
                                  OR (newer.created_at = p.created_at AND newer.id > p.id)
                                )
                                AND (
                                  COALESCE(author.moments_visible_range, 'all') = 'all'
                                  OR (COALESCE(author.moments_visible_range, 'all') IN ('three_days', '3d', 'threedays')
                                      AND newer.created_at >= NOW() - INTERVAL '3 days')
                                  OR (COALESCE(author.moments_visible_range, 'all') IN ('month', '1m')
                                      AND newer.created_at >= NOW() - INTERVAL '1 month')
                                  OR (COALESCE(author.moments_visible_range, 'all') IN ('half_year', 'halfyear', '6m')
                                      AND newer.created_at >= NOW() - INTERVAL '6 months')
                                )
                            ) < 10
                          )
                        ))
                      )
                      AND (
                        p.user_id = ?
                        OR COALESCE(author.moments_visible_range, 'all') = 'all'
                        OR (COALESCE(author.moments_visible_range, 'all') IN ('three_days', '3d', 'threedays')
                            AND p.created_at >= NOW() - INTERVAL '3 days')
                        OR (COALESCE(author.moments_visible_range, 'all') IN ('month', '1m')
                            AND p.created_at >= NOW() - INTERVAL '1 month')
                        OR (COALESCE(author.moments_visible_range, 'all') IN ('half_year', 'halfyear', '6m')
                            AND p.created_at >= NOW() - INTERVAL '6 months')
                      )
                    )
                  )
                """, Integer.class, fileId, fileId, fileId, fileId, viewerId, viewerId, viewerId, viewerId, viewerId, viewerId, viewerId, viewerId);
        return count != null && count > 0;
    }

    private boolean hasVisibleCommunityReference(String fileId, Long viewerId) {
        Integer count = jdbc.queryForObject("""
                SELECT COUNT(*)
                FROM community_post p
                JOIN community c ON c.id = p.community_id
                JOIN community_member m ON m.community_id = p.community_id
                                           AND m.user_id = ? AND m.status = 'ACTIVE'
                WHERE c.status = 'APPROVED'
                  AND p.status = 'PUBLISHED'
                  AND (
                    (',' || COALESCE(p.media_file_ids, '') || ',') LIKE '%,' || ? || ',%'
                    OR (',' || COALESCE(p.quoted_media_file_ids, '') || ',') LIKE '%,' || ? || ',%'
                  )
                """, Integer.class, viewerId, fileId, fileId);
        return count != null && count > 0;
    }

    /** Profile avatars/covers are returned by profile APIs, so their bytes may be read publicly. */
    private boolean hasVisibleCoverReference(String fileId) {
        Integer count = jdbc.queryForObject("""
                SELECT COUNT(*) FROM sys_user u
                WHERE u.avatar_url LIKE '%/files/' || ? || '/%'
                   OR u.moments_cover_url LIKE '%/files/' || ? || '/%'
                """, Integer.class, fileId, fileId);
        return count != null && count > 0;
    }

    /**
     * Resolve a chat-file-backed profile avatar without exposing arbitrary chat
     * attachments. The file id must still be referenced by a user/admin avatar
     * column; this keeps the public image URL limited to profile media.
     */
    public ImFile requireProfileAvatar(String fileId) {
        if (!StringUtils.hasText(fileId)) throw new BizException("头像不存在");
        ImFile file = fileMapper.selectById(fileId.trim());
        if (file == null || !"READY".equalsIgnoreCase(file.getStatus())) {
            throw new BizException("头像不存在");
        }
        Integer count = jdbc.queryForObject("""
                SELECT (
                    (SELECT COUNT(*) FROM sys_user u
                     WHERE u.avatar_url LIKE '%/files/' || ? || '/%')
                    +
                    (SELECT COUNT(*) FROM sys_admin a
                     WHERE a.avatar_url LIKE '%/files/' || ? || '/%')
                )
                """, Integer.class, file.getFileId(), file.getFileId());
        if (count == null || count <= 0) throw new BizException("头像不存在");
        return file;
    }

    public String profileAvatarVariant(ImFile file) {
        return file != null && StringUtils.hasText(file.getThumbObjectKey()) ? "thumb" : "original";
    }

    public StatObjectResponse statProfileAvatar(ImFile file) {
        if (file == null) throw new BizException("头像不存在");
        try {
            return minioClient.statObject(StatObjectArgs.builder()
                    .bucket(fileBucket()).object(objectKey(file, profileAvatarVariant(file))).build());
        } catch (Exception e) {
            throw new BizException("头像不存在");
        }
    }

    public GetObjectResponse openProfileAvatar(ImFile file) {
        if (file == null) throw new BizException("头像不存在");
        try {
            return minioClient.getObject(GetObjectArgs.builder()
                    .bucket(fileBucket()).object(objectKey(file, profileAvatarVariant(file))).build());
        } catch (Exception e) {
            throw new BizException("头像读取失败");
        }
    }

    public String profileAvatarContentType(ImFile file) {
        return "thumb".equals(profileAvatarVariant(file))
                ? "image/jpeg"
                : normalizeContentType(file.getOriginalName(), file.getContentType());
    }

    private boolean hasFavoriteReference(String fileId, Long userId) {
        Integer count = jdbc.queryForObject("""
                SELECT COUNT(*) FROM im_favorite
                WHERE user_id = ? AND (file_id = ? OR (',' || COALESCE(media_file_ids, '') || ',') LIKE '%,' || ? || ',%')
                """, Integer.class, userId, fileId, fileId);
        return count != null && count > 0;
    }

    public StatObjectResponse stat(Long userId, String fileId, String variant) {
        ImFile file = requireReadable(userId, fileId);
        try {
            return minioClient.statObject(StatObjectArgs.builder()
                    .bucket(fileBucket()).object(objectKey(file, variant)).build());
        } catch (Exception e) {
            throw new BizException("文件不存在");
        }
    }

    public GetObjectResponse open(Long userId, String fileId, String variant, long offset, long length) {
        ImFile file = requireReadable(userId, fileId);
        GetObjectArgs.Builder builder = GetObjectArgs.builder()
                .bucket(fileBucket()).object(objectKey(file, variant));
        if (offset > 0) builder.offset(offset);
        if (length > 0) builder.length(length);
        try {
            return minioClient.getObject(builder.build());
        } catch (Exception e) {
            throw new BizException("文件下载失败");
        }
    }

    /**
     * 后台消息审计使用的附件读取边界。调用方必须位于 /api/admin 路由，
     * 因此这里不再套用普通用户的会话成员权限判断。
     */
    public StatObjectResponse statForAdmin(String fileId, String variant) {
        ImFile file = requireAdminFile(fileId);
        try {
            return minioClient.statObject(StatObjectArgs.builder()
                    .bucket(fileBucket()).object(objectKey(file, variant)).build());
        } catch (Exception e) {
            throw new BizException("文件不存在");
        }
    }

    public GetObjectResponse openForAdmin(String fileId, String variant, long offset, long length) {
        ImFile file = requireAdminFile(fileId);
        GetObjectArgs.Builder builder = GetObjectArgs.builder()
                .bucket(fileBucket()).object(objectKey(file, variant));
        if (offset > 0) builder.offset(offset);
        if (length > 0) builder.length(length);
        try {
            return minioClient.getObject(builder.build());
        } catch (Exception e) {
            throw new BizException("文件下载失败");
        }
    }

    public ImFile requireAdminFile(String fileId) {
        if (!StringUtils.hasText(fileId)) throw new BizException("文件不存在");
        ImFile file = fileMapper.selectById(fileId.trim());
        if (file == null || !"READY".equalsIgnoreCase(file.getStatus())) {
            throw new BizException("文件不存在");
        }
        return file;
    }

    public FileMetadataVO toAdminMetadata(ImFile file) {
        return toMetadata(file, "/api/admin/messages/files/" + file.getFileId());
    }

    public FileMetadataVO toMetadata(ImFile file) {
        return toMetadata(file, "/api/v1/files/" + file.getFileId() + "/download");
    }

    private FileMetadataVO toMetadata(ImFile file, String original) {
        String separator = original.contains("?") ? "&" : "?";
        String thumb = StringUtils.hasText(file.getThumbObjectKey()) ? original + separator + "variant=thumb" : null;
        String preview = StringUtils.hasText(file.getPreviewObjectKey()) ? original + separator + "variant=preview" : null;
        String contentType = normalizeContentType(file.getOriginalName(), file.getContentType());
        // Old rows may have been stored as application/octet-stream, so make
        // them eligible for the same asynchronous MP4/cover compatibility
        // pipeline when their filename identifies a video.
        if (contentType.startsWith("video/")
                && !StringUtils.hasText(file.getThumbObjectKey())
                && !StringUtils.hasText(file.getPreviewObjectKey())) {
            scheduleVideoRenditions(file);
        }
        return FileMetadataVO.builder()
                .fileId(file.getFileId())
                .objectKey(file.getObjectKey())
                .thumbObjectKey(file.getThumbObjectKey())
                .previewObjectKey(file.getPreviewObjectKey())
                .name(file.getOriginalName())
                .size(file.getSizeBytes() == null ? 0L : file.getSizeBytes())
                .contentType(contentType)
                .sha256(file.getSha256())
                .width(file.getWidth())
                .height(file.getHeight())
                .durationMs(file.getDurationMs())
                .url(original)
                .originalUrl(original)
                .thumbUrl(thumb)
                .previewUrl(preview)
                .downloadUrl(original)
                .build();
    }

    public Map<String, Object> metadataMap(ImFile file) {
        return metadataMap(toMetadata(file));
    }

    private Map<String, Object> metadataMap(FileMetadataVO value) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("fileId", value.getFileId());
        out.put("objectKey", value.getObjectKey());
        out.put("thumbObjectKey", value.getThumbObjectKey());
        out.put("previewObjectKey", value.getPreviewObjectKey());
        out.put("url", value.getUrl());
        out.put("downloadUrl", value.getDownloadUrl());
        out.put("originalUrl", value.getOriginalUrl());
        out.put("thumbUrl", value.getThumbUrl());
        out.put("previewUrl", value.getPreviewUrl());
        out.put("name", value.getName());
        out.put("size", value.getSize());
        out.put("originalSize", value.getSize());
        out.put("contentType", value.getContentType());
        out.put("sha256", value.getSha256());
        out.put("width", value.getWidth());
        out.put("height", value.getHeight());
        out.put("durationMs", value.getDurationMs());
        return out;
    }

    private String objectKey(ImFile file, String variant) {
        String requested = StringUtils.hasText(variant) ? variant.trim().toLowerCase(Locale.ROOT) : "original";
        if ("original".equals(requested)) return file.getObjectKey();
        if ("thumb".equals(requested) && StringUtils.hasText(file.getThumbObjectKey())) {
            return file.getThumbObjectKey();
        }
        if ("preview".equals(requested) && StringUtils.hasText(file.getPreviewObjectKey())) {
            return file.getPreviewObjectKey();
        }
        // Never silently turn a missing rendition into an original-file
        // download. That made a thumbnail/preview request unexpectedly pull
        // a large private object and defeated the cache policy.
        if ("thumb".equals(requested) || "preview".equals(requested)) {
            throw new BizException("文件预览版本尚未生成");
        }
        throw new BizException("不支持的文件版本");
    }

    private void putObject(String key, Path path, String contentType) throws Exception {
        minioClient.putObject(PutObjectArgs.builder()
                .bucket(fileBucket())
                .object(key)
                .stream(Files.newInputStream(path), Files.size(path), -1)
                .contentType(contentType)
                .build());
    }

    private void scheduleVideoRenditions(ImFile entity) {
        if (entity == null || !StringUtils.hasText(entity.getFileId())
                || !videoRenditionInFlight.add(entity.getFileId())) return;
        try {
            VIDEO_RENDITION_EXECUTOR.execute(() -> {
                try {
                    generateVideoRenditions(entity);
                } finally {
                    videoRenditionInFlight.remove(entity.getFileId());
                }
            });
        } catch (RuntimeException rejected) {
            videoRenditionInFlight.remove(entity.getFileId());
            throw rejected;
        }
    }

    private void generateVideoRenditions(ImFile entity) {
        Path source = null;
        Path thumb = null;
        Path preview = null;
        String fileId = entity.getFileId();
        try {
            String extension = extensionOf(entity.getOriginalName());
            source = Files.createTempFile("pulse-chat-video-source-", extension.isBlank() ? ".bin" : extension);
            try (GetObjectResponse input = minioClient.getObject(GetObjectArgs.builder()
                    .bucket(fileBucket()).object(entity.getObjectKey()).build())) {
                Files.copy(input, source, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            }
            thumb = createVideoThumb(source);
            if (thumb != null) {
                String thumbKey = "chat/" + entity.getUploaderId() + "/" + fileId + "/thumb.jpg";
                putObject(thumbKey, thumb, "image/jpeg");
                entity.setThumbObjectKey(thumbKey);
                entity.setUpdatedAt(OffsetDateTime.now());
                fileMapper.updateById(entity);
            }
            preview = createVideoPreview(source);
            if (preview != null) {
                String previewKey = "chat/" + entity.getUploaderId() + "/" + fileId + "/preview.mp4";
                putObject(previewKey, preview, "video/mp4");
                entity.setPreviewObjectKey(previewKey);
                entity.setUpdatedAt(OffsetDateTime.now());
                fileMapper.updateById(entity);
            }
            if (thumb == null && preview == null) {
                log.info("video renditions unavailable fileId={}; original remains downloadable", fileId);
            }
        } catch (Exception error) {
            log.warn("video rendition generation failed fileId={}: {}", fileId, error.getMessage());
        } finally {
            deleteQuietly(source);
            deleteQuietly(thumb);
            deleteQuietly(preview);
        }
    }

    private void deleteUploadedObjects(Set<String> keys) {
        for (String key : keys) {
            try {
                minioClient.removeObject(RemoveObjectArgs.builder()
                        .bucket(fileBucket()).object(key).build());
            } catch (Exception cleanupError) {
                log.warn("failed to rollback chat object {}: {}", key, cleanupError.getMessage());
            }
        }
    }

    private String fileBucket() {
        return StringUtils.hasText(minioProperties.getFileBucket())
                ? minioProperties.getFileBucket() : minioProperties.getBucket();
    }

    private static String sha256(Path path) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream in = Files.newInputStream(path); DigestInputStream digestIn = new DigestInputStream(in, digest)) {
            digestIn.transferTo(java.io.OutputStream.nullOutputStream());
        }
        return HexFormat.of().formatHex(digest.digest());
    }

    private static Path createImageThumb(BufferedImage source) throws IOException {
        return createImageRendition(source, 480, "pulse-chat-thumb-");
    }

    private static Path createImagePreview(BufferedImage source) throws IOException {
        return createImageRendition(source, 1440, "pulse-chat-preview-");
    }

    private static Path createImageRendition(BufferedImage source, int max, String prefix) throws IOException {
        double scale = Math.min(1d, Math.min(max / (double) source.getWidth(), max / (double) source.getHeight()));
        int width = Math.max(1, (int) Math.round(source.getWidth() * scale));
        int height = Math.max(1, (int) Math.round(source.getHeight() * scale));
        BufferedImage target = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = target.createGraphics();
        try {
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            graphics.drawImage(source, 0, 0, width, height, null);
        } finally {
            graphics.dispose();
        }
        Path targetPath = Files.createTempFile(prefix, ".jpg");
        ImageIO.write(target, "jpg", targetPath.toFile());
        return targetPath;
    }

    private Path createVideoThumb(Path source) {
        Path output = null;
        try {
            output = Files.createTempFile("pulse-chat-video-thumb-", ".jpg");
            Process process = new ProcessBuilder(
                    resolveFfmpegBinary(), "-y", "-ss", "0.15", "-i", source.toAbsolutePath().toString(),
                    "-frames:v", "1", "-q:v", "6", "-vf", "scale='min(480,iw)':-2",
                    output.toAbsolutePath().toString())
                    .redirectError(ProcessBuilder.Redirect.DISCARD)
                    .redirectOutput(ProcessBuilder.Redirect.DISCARD)
                    .start();
            if (!process.waitFor(20, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                Files.deleteIfExists(output);
                return null;
            }
            if (process.exitValue() != 0 || !Files.isRegularFile(output) || Files.size(output) < 128) {
                Files.deleteIfExists(output);
                return null;
            }
            return output;
        } catch (Exception e) {
            deleteQuietly(output);
            log.debug("video thumbnail unavailable for {}: {}", source.getFileName(), e.getMessage());
            return null;
        }
    }

    private Path createVideoPreview(Path source) {
        Path output = null;
        try {
            output = Files.createTempFile("pulse-chat-video-preview-", ".mp4");
            Process process = new ProcessBuilder(
                    resolveFfmpegBinary(), "-y", "-i", source.toAbsolutePath().toString(),
                    // The preview is only used for in-app playback. Keep it
                    // small and fast so mobile WebViews do not wait for a
                    // near-original 1440px transcode/download.
                    "-vf", "scale='min(960,iw)':-2", "-c:v", "libx264", "-preset", "veryfast",
                    "-crf", "30", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart",
                    output.toAbsolutePath().toString())
                    .redirectError(ProcessBuilder.Redirect.DISCARD)
                    .redirectOutput(ProcessBuilder.Redirect.DISCARD)
                    .start();
            if (!process.waitFor(90, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                Files.deleteIfExists(output);
                return null;
            }
            if (process.exitValue() != 0 || !Files.isRegularFile(output) || Files.size(output) < 1024) {
                Files.deleteIfExists(output);
                return null;
            }
            return output;
        } catch (Exception e) {
            deleteQuietly(output);
            log.debug("video preview unavailable for {}: {}", source.getFileName(), e.getMessage());
            return null;
        }
    }

    private String resolveFfmpegBinary() {
        if (StringUtils.hasText(ffmpegPath)) {
            try {
                Path configured = Paths.get(ffmpegPath.trim());
                if (Files.isRegularFile(configured)) return configured.toAbsolutePath().toString();
            } catch (Exception ignored) {
                // Fall back to PATH below.
            }
        }
        return "ffmpeg";
    }

    private static String sanitizeName(String raw) {
        if (raw == null) return "";
        String name = raw.replace('\\', '/');
        int slash = name.lastIndexOf('/');
        if (slash >= 0) name = name.substring(slash + 1);
        return name.replaceAll("[\\u0000-\\u001f\\u007f]", "").trim();
    }

    private static String extensionOf(String name) {
        if (name == null) return "";
        int dot = name.lastIndexOf('.');
        return dot >= 0 ? name.substring(dot).toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9.]", "") : "";
    }

    private static String normalizeContentType(String name, String rawContentType) {
        String raw = StringUtils.hasText(rawContentType)
                ? rawContentType.trim().toLowerCase(Locale.ROOT).split(";", 2)[0].trim()
                : "";
        if (!raw.isBlank() && !isGenericContentType(raw)) return raw;
        String inferred = contentTypeForExtension(extensionOf(name));
        return inferred != null ? inferred : (raw.isBlank() ? "application/octet-stream" : raw);
    }

    private static boolean isGenericContentType(String value) {
        return "application/octet-stream".equals(value)
                || "binary/octet-stream".equals(value)
                || "application/force-download".equals(value)
                || "application/download".equals(value);
    }

    private static String contentTypeForExtension(String extension) {
        return switch (extension) {
            case ".jpg", ".jpeg" -> "image/jpeg";
            case ".png" -> "image/png";
            case ".gif" -> "image/gif";
            case ".webp" -> "image/webp";
            case ".heic" -> "image/heic";
            case ".heif" -> "image/heif";
            case ".bmp" -> "image/bmp";
            case ".mp4" -> "video/mp4";
            case ".mov" -> "video/quicktime";
            case ".m4v" -> "video/x-m4v";
            case ".webm" -> "video/webm";
            case ".3gp", ".3gpp" -> "video/3gpp";
            case ".avi" -> "video/x-msvideo";
            case ".mkv" -> "video/x-matroska";
            case ".ogv" -> "video/ogg";
            case ".mp3" -> "audio/mpeg";
            case ".wav" -> "audio/wav";
            case ".ogg" -> "audio/ogg";
            case ".m4a" -> "audio/mp4";
            case ".aac" -> "audio/aac";
            default -> null;
        };
    }

    private static void deleteQuietly(Path path) {
        if (path == null) return;
        try { Files.deleteIfExists(path); } catch (IOException ignored) { }
    }
}
