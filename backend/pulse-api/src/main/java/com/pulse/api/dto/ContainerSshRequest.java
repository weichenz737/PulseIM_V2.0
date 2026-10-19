package com.pulse.api.dto;

/**
 * 管理端本次 SSH 操作的临时凭据。该对象只存在于当前请求和任务调用栈，
 * 不写入数据库、不写入操作日志。
 */
public record ContainerSshRequest(
        String host,
        Integer port,
        String username,
        String authType,
        String password,
        String privateKey,
        String privateKeyPassphrase,
        String hostKeyFingerprint
) {
}
