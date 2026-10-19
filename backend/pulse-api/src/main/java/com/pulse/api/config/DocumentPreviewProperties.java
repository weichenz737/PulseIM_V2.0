package com.pulse.api.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Data
@Configuration
@ConfigurationProperties(prefix = "pulse.document-preview")
public class DocumentPreviewProperties {
    /** Whether LibreOffice based document preview is enabled. */
    private boolean enabled = true;

    /** LibreOffice executable; blank uses the executable available on PATH. */
    private String libreOfficePath = "soffice";

    /** Maximum source document size accepted for conversion. */
    private long maxSourceBytes = 100L * 1024L * 1024L;

    /** Maximum time allowed for one conversion process. */
    private long conversionTimeoutSeconds = 90;

    /** Maximum total size of server-side converted PDF previews. */
    private long cacheMaxBytes = 2L * 1024L * 1024L * 1024L;

    /** Remove converted previews not touched within this period. */
    private long cacheTtlHours = 168;

    public long safeTimeoutSeconds() {
        return Math.max(10, Math.min(conversionTimeoutSeconds, 600));
    }
}
