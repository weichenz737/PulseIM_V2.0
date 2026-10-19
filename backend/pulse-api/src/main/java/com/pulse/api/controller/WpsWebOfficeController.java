package com.pulse.api.controller;

import com.pulse.api.security.AuthContext;
import com.pulse.api.service.WpsWebOfficeService;
import com.pulse.common.result.R;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/wps")
@RequiredArgsConstructor
public class WpsWebOfficeController {
    private final WpsWebOfficeService service;

    /** 登录用户获取一次性 WebOffice 文档初始化参数。 */
    @PostMapping("/preview")
    public R<Map<String, Object>> preview(@RequestBody Map<String, String> body) {
        return R.ok(service.preparePreview(
                AuthContext.currentUserId(),
                body == null ? "" : body.get("url"),
                body == null ? "" : body.get("name"),
                body == null ? "" : body.get("contentType")
        ));
    }

    @PostMapping("/preview/refresh")
    public R<Map<String, Object>> refresh(@RequestBody Map<String, String> body) {
        return R.ok(service.refreshPreview(
                AuthContext.currentUserId(),
                body == null ? "" : body.get("fileId")
        ));
    }

    /** WebOffice 回调：获取文档信息。 */
    @GetMapping("/weboffice/v3/3rd/files/{fileId}")
    public Map<String, Object> info(
            @PathVariable String fileId,
            @RequestHeader("X-WebOffice-Token") String token,
            HttpServletRequest request) {
        service.verifyCallback(request);
        return service.fileInfo(fileId, token, request.getHeader("X-User-Query"));
    }

    /** WebOffice 回调：获取文档下载地址。 */
    @GetMapping("/weboffice/v3/3rd/files/{fileId}/download")
    public Map<String, Object> download(
            @PathVariable String fileId,
            @RequestHeader("X-WebOffice-Token") String token,
            HttpServletRequest request) {
        service.verifyCallback(request);
        return service.fileDownload(fileId, token);
    }

    /** WebOffice 回调：只读预览权限。 */
    @GetMapping("/weboffice/v3/3rd/files/{fileId}/permission")
    public Map<String, Object> permission(
            @PathVariable String fileId,
            @RequestHeader("X-WebOffice-Token") String token,
            HttpServletRequest request) {
        service.verifyCallback(request);
        return service.filePermission(fileId, token);
    }

    /** WPS 集群根据下载地址取文件；令牌放在 URL 中，避免依赖 WPS 转发自定义请求头。 */
    @GetMapping("/weboffice/files/{fileId}")
    public void file(
            @PathVariable String fileId,
            @RequestParam("token") String token,
            HttpServletResponse response) throws IOException {
        Path path = service.resolveDownload(fileId, token);
        response.setStatus(HttpServletResponse.SC_OK);
        response.setContentType(MediaType.APPLICATION_OCTET_STREAM_VALUE);
        response.setHeader(HttpHeaders.CONTENT_DISPOSITION,
                "inline; filename=\"" + path.getFileName().toString().replace("\"", "") + "\"");
        response.setContentLengthLong(Files.size(path));
        Files.copy(path, response.getOutputStream());
    }
}
