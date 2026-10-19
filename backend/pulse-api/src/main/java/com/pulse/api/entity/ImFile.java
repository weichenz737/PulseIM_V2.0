package com.pulse.api.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

/** Metadata for an object stored in MinIO. No file bytes are stored in PostgreSQL. */
@Data
@TableName("im_file")
public class ImFile {
    @TableId(type = IdType.INPUT)
    private String fileId;
    private Long uploaderId;
    private String objectKey;
    private String thumbObjectKey;
    private String previewObjectKey;
    private String originalName;
    private String contentType;
    private Long sizeBytes;
    private String sha256;
    private Integer width;
    private Integer height;
    private Long durationMs;
    private String status;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
}
