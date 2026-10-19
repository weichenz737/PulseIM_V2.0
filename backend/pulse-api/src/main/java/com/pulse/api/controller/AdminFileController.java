package com.pulse.api.controller;

import com.pulse.api.security.AuthContext;
import com.pulse.api.service.AppVersionService;
import com.pulse.api.service.FileService;
import com.pulse.common.exception.BizException;
import com.pulse.common.result.R;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.Locale;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/admin/files")
@RequiredArgsConstructor
public class AdminFileController {
    private static final long MAX_AVATAR_BYTES = 5L * 1024 * 1024;
    private static final Set<String> ALLOWED_EXT = Set.of(".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp");

    private final FileService fileService;
    private final AppVersionService appVersionService;

    @PostMapping(value = "/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public R<Map<String, Object>> uploadAvatar(@RequestParam("file") MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BizException("请选择图片");
        }
        if (file.getSize() > MAX_AVATAR_BYTES) {
            throw new BizException("头像不能超过 5MB");
        }
        String contentType = file.getContentType();
        if (!StringUtils.hasText(contentType) || !contentType.toLowerCase(Locale.ROOT).startsWith("image/")) {
            throw new BizException("仅支持图片文件");
        }
        String name = file.getOriginalFilename();
        if (StringUtils.hasText(name)) {
            int dot = name.lastIndexOf('.');
            if (dot >= 0) {
                String ext = name.substring(dot).toLowerCase(Locale.ROOT);
                if (!ALLOWED_EXT.contains(ext)) {
                    throw new BizException("仅支持 jpg/png/gif/webp 等常见图片格式");
                }
            }
        }
        Long adminId = AuthContext.currentUserId();
        return R.ok(fileService.uploadChatFile(adminId == null ? 0L : adminId, file));
    }

    @PostMapping(value = "/ringtone", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public R<Map<String, Object>> uploadRingtone(@RequestParam("file") MultipartFile file) {
        Long adminId = AuthContext.currentUserId();
        return R.ok(fileService.uploadRingtone(adminId == null ? 0L : adminId, file));
    }

    @PostMapping(value = "/app-apk", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public R<Map<String, Object>> uploadAppApk(@RequestParam("file") MultipartFile file) {
        Long adminId = AuthContext.currentUserId();
        Map<String, Object> uploaded = fileService.uploadAppApk(adminId == null ? 0L : adminId, file);
        appVersionService.applyUploadedApk(uploaded);
        return R.ok(uploaded);
    }

    /** 预热历史头像 128px 缓存，加快后台列表加载 */
    @PostMapping("/warm-avatars")
    public R<Map<String, Object>> warmAvatars(
            @RequestParam(value = "limit", required = false, defaultValue = "500") int limit) {
        AuthContext.currentUserId();
        int count = fileService.warmAvatarThumbs(limit);
        return R.ok(Map.of("warmed", count));
    }
}
