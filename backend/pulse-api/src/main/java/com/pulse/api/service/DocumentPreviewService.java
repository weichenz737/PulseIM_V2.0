package com.pulse.api.service;

import com.pulse.api.config.DocumentPreviewProperties;
import com.pulse.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Set;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/** Converts office files to cached PDFs for the web and mobile PDF.js viewer. */
@Slf4j
@Service
@RequiredArgsConstructor
public class DocumentPreviewService {
    private static final Set<String> OFFICE_EXTENSIONS = Set.of(
            "doc", "docx", "docm", "dot", "dotx", "dotm", "rtf", "wps", "wpt",
            "xls", "xlsx", "xlsm", "xlt", "xltx", "xltm", "csv", "et",
            "ppt", "pptx", "pptm", "pps", "ppsx", "ppsm", "pot", "potx", "potm", "dpt", "dps",
            "odt", "ods", "odp"
    );

    private final FileService fileService;
    private final DocumentPreviewProperties properties;
    private final ConcurrentHashMap<String, Object> conversionLocks = new ConcurrentHashMap<>();

    @Value("${pulse.document-preview.cache-dir:}")
    private String configuredCacheDirectory;

    /**
     * Start Office-to-PDF conversion after upload so the first mobile preview
     * does not have to pay the full LibreOffice startup cost.
     */
    public void warmPreviewAsync(String filename) {
        String value = String.valueOf(filename == null ? "" : filename).trim();
        String ext = extension(value);
        if (!OFFICE_EXTENSIONS.contains(ext)) return;
        CompletableFuture.runAsync(() -> {
            try {
                resolvePdf(value);
            } catch (Exception e) {
                log.debug("background document preview warm-up skipped for {}: {}", value, e.getMessage());
            }
        });
    }

    public Path resolvePdf(String filename) {
        Path source = fileService.resolveRawPath(filename);
        return resolvePdf(source, null);
    }

    /**
     * Resolve a PDF from an already materialized source file.  A non-null
     * cache identity is used by the MinIO-backed chat endpoint so the
     * temporary source file can be deleted without deleting the converted PDF
     * cache as well.
     */
    public Path resolvePdf(Path source, String cacheIdentity) {
        if (source == null || !Files.isRegularFile(source)) {
            throw new BizException("文件不存在");
        }
        String extension = extension(source.getFileName().toString());
        if ("pdf".equals(extension)) return source;
        if (!OFFICE_EXTENSIONS.contains(extension)) {
            throw new BizException("该文件类型暂不支持在线预览");
        }
        if (!properties.isEnabled()) {
            throw new BizException("在线文档预览未启用");
        }
        try {
            long size = Files.size(source);
            if (size > properties.getMaxSourceBytes()) {
                throw new BizException("文件超过在线预览大小限制");
            }
            long modified = Files.getLastModifiedTime(source).toMillis();
            String identity = StringUtils.hasText(cacheIdentity)
                    ? cacheIdentity.trim()
                    : source.toAbsolutePath().normalize().toString();
            String cacheKey = StringUtils.hasText(cacheIdentity)
                    ? identity + "|" + size
                    : identity + "|" + size + "|" + modified;
            String digest = sha256(cacheKey);
            Path cacheRoot = StringUtils.hasText(cacheIdentity)
                    ? configuredCacheRoot()
                    : source.getParent().resolve(".preview-pdf").normalize();
            if (!StringUtils.hasText(cacheIdentity)
                    && !cacheRoot.startsWith(source.getParent().normalize())) {
                throw new BizException("非法预览路径");
            }
            Path cached = cacheRoot.resolve(digest + ".pdf").normalize();
            if (Files.isRegularFile(cached) && Files.size(cached) > 0) return cached;

            Object lock = conversionLocks.computeIfAbsent(digest, ignored -> new Object());
            synchronized (lock) {
                try {
                    if (Files.isRegularFile(cached) && Files.size(cached) > 0) return cached;
                    Path result = convert(source, cacheRoot, cached);
                    if (StringUtils.hasText(cacheIdentity)) pruneConfiguredCache(result);
                    return result;
                } finally {
                    conversionLocks.remove(digest, lock);
                }
            }
        } catch (BizException e) {
            throw e;
        } catch (IOException e) {
            log.warn("document preview file error: {}", e.toString());
            throw new BizException("读取文件失败");
        }
    }

    /**
     * Returns an already converted chat PDF without downloading the MinIO
     * source again. The identity and source size mirror resolvePdf(Path,...).
     */
    public Path findCachedChatPdf(String cacheIdentity, long sourceSize) {
        if (!StringUtils.hasText(cacheIdentity) || sourceSize <= 0 || !properties.isEnabled()) return null;
        try {
            Path cached = configuredCacheRoot().resolve(
                    sha256(cacheIdentity.trim() + "|" + sourceSize) + ".pdf").normalize();
            return Files.isRegularFile(cached) && Files.size(cached) > 0 ? cached : null;
        } catch (IOException e) {
            return null;
        }
    }

    private void pruneConfiguredCache(Path keep) {
        try {
            Path root = configuredCacheRoot();
            long maxBytes = Math.max(64L * 1024L * 1024L, properties.getCacheMaxBytes());
            long ttlMillis = Math.max(1L, properties.getCacheTtlHours()) * 60L * 60L * 1000L;
            long now = System.currentTimeMillis();
            List<Path> files;
            try (var stream = Files.list(root)) {
                files = stream.filter(path -> path.getFileName().toString().endsWith(".pdf") && Files.isRegularFile(path)).toList();
            }
            List<Path> removable = new ArrayList<>();
            long total = 0;
            for (Path path : files) {
                long size = Files.size(path);
                total += Math.max(0, size);
                if (!path.equals(keep) && now - Files.getLastModifiedTime(path).toMillis() > ttlMillis) removable.add(path);
            }
            for (Path path : removable) {
                long size = Files.size(path);
                if (Files.deleteIfExists(path)) total -= Math.max(0, size);
            }
            if (total <= maxBytes) return;
            List<Path> byAge = files.stream()
                    .filter(path -> !path.equals(keep) && !removable.contains(path))
                    .sorted(Comparator.comparingLong(DocumentPreviewService::lastModified))
                    .toList();
            for (Path path : byAge) {
                if (total <= maxBytes) break;
                try {
                    long size = Files.size(path);
                    if (Files.deleteIfExists(path)) total -= Math.max(0, size);
                } catch (IOException ignored) {
                    // A PDF currently being served may be locked on Windows.
                }
            }
        } catch (Exception e) {
            log.debug("document preview cache prune skipped: {}", e.getMessage());
        }
    }

    private static long lastModified(Path path) {
        try {
            return Files.getLastModifiedTime(path).toMillis();
        } catch (IOException e) {
            return Long.MAX_VALUE;
        }
    }

    private Path configuredCacheRoot() {
        String configured = StringUtils.hasText(configuredCacheDirectory)
                ? configuredCacheDirectory.trim()
                : Paths.get(System.getProperty("java.io.tmpdir"), "pulse-document-previews").toString();
        Path root = Paths.get(configured).toAbsolutePath().normalize();
        try {
            Files.createDirectories(root);
        } catch (IOException e) {
            throw new BizException("无法创建文档预览缓存");
        }
        return root;
    }

    private Path convert(Path source, Path cacheRoot, Path cached) {
        Path workDir = cacheRoot.resolve(".tmp-" + UUID.randomUUID()).normalize();
        Path profileDir = workDir.resolve("profile").normalize();
        try {
            Files.createDirectories(workDir);
            Files.createDirectories(profileDir);
            String executable = resolveLibreOfficeExecutable();
            ProcessBuilder builder = new ProcessBuilder(
                    executable,
                    "--headless",
                    "--nologo",
                    "--nodefault",
                    "--nolockcheck",
                    "--nofirststartwizard",
                    "-env:UserInstallation=" + profileDir.toUri(),
                    "--convert-to", "pdf",
                    "--outdir", workDir.toAbsolutePath().toString(),
                    source.toAbsolutePath().toString()
            );
            builder.redirectErrorStream(true);
            builder.redirectOutput(ProcessBuilder.Redirect.DISCARD);
            Process process = builder.start();
            boolean finished = process.waitFor(properties.safeTimeoutSeconds(), TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                throw new BizException("文件转换超时，请稍后重试");
            }
            if (process.exitValue() != 0) {
                throw new BizException("文件转换失败，请下载后查看");
            }

            String sourceName = source.getFileName().toString();
            int dot = sourceName.lastIndexOf('.');
            String convertedName = (dot > 0 ? sourceName.substring(0, dot) : sourceName) + ".pdf";
            Path converted = workDir.resolve(convertedName).normalize();
            if (!Files.isRegularFile(converted) || Files.size(converted) <= 0) {
                throw new BizException("文件转换未生成 PDF");
            }
            Files.createDirectories(cacheRoot);
            try {
                Files.move(converted, cached, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (java.nio.file.AtomicMoveNotSupportedException ignored) {
                Files.move(converted, cached, StandardCopyOption.REPLACE_EXISTING);
            }
            return cached;
        } catch (BizException e) {
            throw e;
        } catch (IOException e) {
            log.warn("LibreOffice conversion failed for {}: {}", source, e.toString());
            throw new BizException("文件转换失败，请检查服务器是否安装 LibreOffice");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BizException("文件转换被中断");
        } finally {
            deleteTree(workDir);
        }
    }

    /**
     * Windows desktop installations commonly do not add LibreOffice to PATH.
     * Keep the container-friendly "soffice" default, but also recognize the
     * standard Windows installation locations before starting the process.
     */
    private String resolveLibreOfficeExecutable() {
        String configured = StringUtils.hasText(properties.getLibreOfficePath())
                ? properties.getLibreOfficePath().trim() : "soffice";
        if (!isDefaultExecutable(configured)) return configured;

        String[] programRoots = {
                System.getenv("ProgramFiles"),
                System.getenv("ProgramFiles(x86)"),
                System.getenv("LOCALAPPDATA")
        };
        for (String root : programRoots) {
            if (!StringUtils.hasText(root)) continue;
            Path candidate = Paths.get(root, "LibreOffice", "program", "soffice.exe");
            if (Files.isRegularFile(candidate)) return candidate.toString();
        }
        return configured;
    }

    private static boolean isDefaultExecutable(String executable) {
        return "soffice".equalsIgnoreCase(executable) || "soffice.exe".equalsIgnoreCase(executable);
    }

    private static String extension(String filename) {
        String value = String.valueOf(filename).toLowerCase(Locale.ROOT);
        int query = value.indexOf('?');
        if (query >= 0) value = value.substring(0, query);
        int dot = value.lastIndexOf('.');
        return dot >= 0 && dot < value.length() - 1 ? value.substring(dot + 1) : "";
    }

    private static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (Exception e) {
            throw new IllegalStateException("无法生成预览缓存键", e);
        }
    }

    private static void deleteTree(Path root) {
        if (root == null || !Files.exists(root)) return;
        try (var paths = Files.walk(root)) {
            paths.sorted((a, b) -> b.getNameCount() - a.getNameCount())
                    .forEach(path -> {
                        try {
                            Files.deleteIfExists(path);
                        } catch (IOException ignored) {
                            // Temporary conversion files can be cleaned on a later run.
                        }
                    });
        } catch (IOException ignored) {
            // Ignore cleanup failures; the conversion result is already available.
        }
    }
}
