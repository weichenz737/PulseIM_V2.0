package com.pulse.api.vo;

import lombok.Builder;
import lombok.Data;

/** Small file descriptor sent with a chat message. It contains URLs, never bytes. */
@Data
@Builder
public class FileMetadataVO {
    private String fileId;
    private String objectKey;
    private String thumbObjectKey;
    private String previewObjectKey;
    private String name;
    private long size;
    private String contentType;
    private String sha256;
    private Integer width;
    private Integer height;
    private Long durationMs;
    private String url;
    private String originalUrl;
    private String thumbUrl;
    private String previewUrl;
    private String downloadUrl;
}
