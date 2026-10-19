UPDATE sys_app_version
SET version_code = 6,
    version_name = '2.4',
    apk_url = '/api/v1/files/raw/PulseIM-v2-2.4.apk',
    apk_name = 'PulseIM-v2-2.4.apk',
    apk_size = 41076293,
    release_notes = '在线状态实时更新：好友上线/离线即时可见；优化离线检测延迟（心跳45s/宽限10s）',
    force_update = FALSE,
    enabled = TRUE,
    updated_at = NOW()
WHERE id = 1;
