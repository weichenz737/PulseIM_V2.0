package com.pulse.api.dto;

public record ContainerCleanupRequest(
        ContainerSshRequest ssh,
        String confirmText
) {
}
