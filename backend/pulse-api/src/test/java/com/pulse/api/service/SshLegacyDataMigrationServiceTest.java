package com.pulse.api.service;

import com.pulse.api.dto.ContainerDataMigrationRequest;
import com.pulse.api.dto.ContainerSshRequest;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

class SshLegacyDataMigrationServiceTest {
    private final SshContainerControlService sshService = mock(SshContainerControlService.class);
    private final ContainerConfigService containerConfigService = mock(ContainerConfigService.class);
    private final SshLegacyDataMigrationService service = new SshLegacyDataMigrationService(sshService, containerConfigService);

    @Test
    void rejectsMigrationWithoutExactConfirmation() {
        ContainerDataMigrationRequest request = new ContainerDataMigrationRequest(
                ssh("198.51.100.20"), ssh("203.0.113.10"), "wrong");

        assertThatThrownBy(() -> service.migrate(request))
                .hasMessageContaining("MIGRATE_PULSEIM_LEGACY_DATA");
        verifyNoInteractions(sshService);
    }

    @Test
    void rejectsSameSourceAndTargetBeforeOpeningSsh() {
        ContainerDataMigrationRequest request = new ContainerDataMigrationRequest(
                ssh("198.51.100.20"), ssh("198.51.100.20"), null);

        assertThatThrownBy(() -> service.preview(request))
                .hasMessageContaining("不能是同一台服务器");
        verifyNoInteractions(sshService);
    }

    private static ContainerSshRequest ssh(String host) {
        return new ContainerSshRequest(host, 22, "operator", "PASSWORD", "secret", null, null, "SHA256:test");
    }
}
