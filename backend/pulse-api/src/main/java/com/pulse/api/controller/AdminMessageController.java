package com.pulse.api.controller;

import com.pulse.api.entity.ImFile;
import com.pulse.api.service.ChatFileStorageService;
import com.pulse.api.service.AdminMessageService;
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

import java.io.IOException;
import java.io.OutputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminMessageController {
    private final AdminMessageService adminMessageService;
    private final ChatFileStorageService chatFileStorageService;

    private static final long RANGE_CHUNK = 4L * 1024 * 1024;

    /**
     * 聊天记录：conversationType=1 私聊，=2 群聊
     */
    @GetMapping("/messages")
    public R<Map<String, Object>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "1") int conversationType,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long conversationId,
            @RequestParam(required = false) Long fromUserId,
            @RequestParam(required = false) Integer msgType,
            /** video | file：在 msgType=2 中再区分视频与文件 */
            @RequestParam(required = false) String mediaKind,
            /** live-location：msgType=0 中的实时位置共享消息 */
            @RequestParam(required = false) String contentKind,
            @RequestParam(required = false) Boolean recalled,
            @RequestParam(required = false) Boolean userDeleted
    ) {
        return R.ok(adminMessageService.listMessages(
                page, size, conversationType, keyword, conversationId, fromUserId,
                msgType, mediaKind, contentKind, recalled, userDeleted
        ));
    }

    /** 查看某条消息的前后上下文（聊天窗口） */
    @GetMapping("/messages/context")
    public R<Map<String, Object>> context(
            @RequestParam Long conversationId,
            @RequestParam(required = false) Long anchorId,
            @RequestParam(required = false) Long beforeId,
            @RequestParam(required = false) Long afterId,
            @RequestParam(defaultValue = "30") int before,
            @RequestParam(defaultValue = "30") int after
    ) {
        return R.ok(adminMessageService.listContext(
                conversationId, anchorId, beforeId, afterId, before, after
        ));
    }

    /** 管理员查看消息附件，支持图片、音视频和断点视频播放。 */
    @GetMapping({
            "/messages/files/{fileId}",
            "/moments/files/{fileId}",
            "/communities/content/files/{fileId}"
    })
    public void messageFile(
            @PathVariable String fileId,
            @RequestParam(value = "variant", required = false, defaultValue = "original") String variant,
            HttpServletRequest request,
            HttpServletResponse response
    ) throws IOException {
        ImFile file = chatFileStorageService.requireAdminFile(fileId);
        FileMetadataVO metadata = chatFileStorageService.toAdminMetadata(file);
        StatObjectResponse stat = chatFileStorageService.statForAdmin(fileId, variant);
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
        if (partial && length > RANGE_CHUNK) {
            end = start + RANGE_CHUNK - 1;
            length = end - start + 1;
        }
        String contentType = StringUtils.hasText(stat.contentType())
                ? stat.contentType() : metadata.getContentType();
        if ("application/octet-stream".equalsIgnoreCase(contentType)
                || "binary/octet-stream".equalsIgnoreCase(contentType)) {
            contentType = metadata.getContentType();
        }
        response.reset();
        response.setBufferSize(64 * 1024);
        response.setStatus(partial ? HttpServletResponse.SC_PARTIAL_CONTENT : HttpServletResponse.SC_OK);
        response.setHeader("Accept-Ranges", "bytes");
        response.setHeader("Content-Length", String.valueOf(length));
        response.setHeader("Content-Type", StringUtils.hasText(contentType)
                ? contentType : MediaType.APPLICATION_OCTET_STREAM_VALUE);
        String name = StringUtils.hasText(metadata.getName()) ? metadata.getName() : fileId;
        response.setHeader("Content-Disposition", "inline; filename*=UTF-8''"
                + URLEncoder.encode(name, StandardCharsets.UTF_8).replace("+", "%20"));
        if (partial) response.setHeader("Content-Range", "bytes " + start + "-" + end + "/" + total);
        try (GetObjectResponse input = chatFileStorageService.openForAdmin(fileId, variant, start, length);
             OutputStream output = response.getOutputStream()) {
            input.transferTo(output);
        }
    }

    /** 批量删除聊天记录（硬删除，不可恢复） */
    @PostMapping("/messages/batch-delete")
    public R<Map<String, Object>> batchDelete(@RequestBody Map<String, Object> body) {
        int deleted = adminMessageService.deleteByIds(parseIds(body));
        Map<String, Object> data = new HashMap<>();
        data.put("deleted", deleted);
        return R.ok(data);
    }

    /**
     * 一键删除全部私聊或群聊记录（硬删除，不可恢复）。
     * body: { conversationType: 1|2 }
     */
    @PostMapping("/messages/clear-all")
    public R<Map<String, Object>> clearAll(
            @RequestBody Map<String, Object> body,
            HttpServletRequest request
    ) {
        int conversationType = 1;
        if (body != null && body.get("conversationType") != null) {
            try {
                conversationType = Integer.parseInt(String.valueOf(body.get("conversationType")));
            } catch (Exception ignored) {
                conversationType = 1;
            }
        }
        int type = conversationType == 2 ? 2 : 1;
        request.setAttribute(
                "_admin_audit_hint",
                type == 2 ? "范围：全部群聊记录" : "范围：全部私聊记录"
        );
        int deleted = adminMessageService.clearAllByConversationType(type);
        Map<String, Object> data = new HashMap<>();
        data.put("deleted", deleted);
        data.put("conversationType", type);
        return R.ok(data);
    }

    private static List<Long> parseIds(Map<String, Object> body) {
        List<Long> ids = new ArrayList<>();
        if (body == null) {
            return ids;
        }
        Object raw = body.get("ids");
        if (!(raw instanceof List<?> list)) {
            return ids;
        }
        for (Object o : list) {
            if (o == null) continue;
            try {
                ids.add(Long.valueOf(String.valueOf(o)));
            } catch (Exception ignored) {
                // skip invalid
            }
        }
        return ids;
    }
}
