package com.pulse.api.dto;

/**
 * 双端数据迁移请求。SSH 凭据只存在于当前 HTTP 请求内，不持久化。
 */
public record ContainerDataMigrationRequest(
        ContainerSshRequest source,
        ContainerSshRequest target,
        String confirmText
) {
}
