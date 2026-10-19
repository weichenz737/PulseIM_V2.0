package com.pulse.im;

import android.Manifest;
import android.content.ContentUris;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.database.Cursor;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.ImageDecoder;
import android.media.MediaMetadataRetriever;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Size;
import java.io.ByteArrayOutputStream;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(
    name = "MediaGallery",
    permissions = {
        @Permission(
            alias = "photos",
            strings = { Manifest.permission.READ_MEDIA_IMAGES }
        ),
        @Permission(
            alias = "videos",
            strings = { Manifest.permission.READ_MEDIA_VIDEO }
        ),
        @Permission(
            alias = "legacyStorage",
            strings = {
                Manifest.permission.WRITE_EXTERNAL_STORAGE,
                Manifest.permission.READ_EXTERNAL_STORAGE
            }
        )
    }
)
public class MediaGalleryPlugin extends Plugin {
    private final Handler downloadHandler = new Handler(Looper.getMainLooper());
    // MediaStore 缩略图解码不能占用 WebView/UI 线程，否则打开相册和分页都会卡顿。
    private final ExecutorService mediaExecutor = Executors.newSingleThreadExecutor();
    private static final class PendingDownload {
        final File target;
        final String mimeType;
        final boolean openAfterDownload;

        PendingDownload(File target, String mimeType, boolean openAfterDownload) {
            this.target = target;
            this.mimeType = mimeType;
            this.openAfterDownload = openAfterDownload;
        }
    }
    // DownloadManager IDs are independent. A single pending slot caused a
    // second download-and-open request to overwrite the first one.
    private final Map<Long, PendingDownload> pendingDownloads = new ConcurrentHashMap<>();

    /**
     * 读取系统媒体库的轻量缩略图，让应用内相册可以直接展示，而不是先跳到系统文件选择器。
     */
    @PluginMethod
    public void listMedia(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (getPermissionState("photos") != PermissionState.GRANTED) {
                requestPermissionForAlias("photos", call, "mediaPhotosPermissionCallback");
                return;
            }
            if (getPermissionState("videos") != PermissionState.GRANTED) {
                requestPermissionForAlias("videos", call, "mediaVideosPermissionCallback");
                return;
            }
        } else if (getPermissionState("legacyStorage") != PermissionState.GRANTED) {
            requestPermissionForAlias("legacyStorage", call, "mediaLegacyPermissionCallback");
            return;
        }
        listMediaNow(call);
    }

    @PermissionCallback
    private void mediaPhotosPermissionCallback(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && getPermissionState("photos") == PermissionState.GRANTED) {
            if (getPermissionState("videos") != PermissionState.GRANTED) {
                requestPermissionForAlias("videos", call, "mediaVideosPermissionCallback");
                return;
            }
            listMediaNow(call);
            return;
        }
        call.reject("未获得照片访问权限");
    }

    @PermissionCallback
    private void mediaVideosPermissionCallback(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && getPermissionState("videos") == PermissionState.GRANTED) {
            listMediaNow(call);
            return;
        }
        call.reject("未获得视频访问权限");
    }

    @PermissionCallback
    private void mediaLegacyPermissionCallback(PluginCall call) {
        if (getPermissionState("legacyStorage") == PermissionState.GRANTED) {
            listMediaNow(call);
            return;
        }
        call.reject("未获得相册访问权限");
    }

    private void listMediaNow(PluginCall call) {
        mediaExecutor.execute(() -> listMediaNowOnWorker(call));
    }

    private void listMediaNowOnWorker(PluginCall call) {
        ContentResolver resolver = getContext().getContentResolver();
        Uri collection = MediaStore.Files.getContentUri("external");
        int offset = Math.max(0, call.getInt("offset", 0));
        int limit = Math.max(1, Math.min(60, call.getInt("limit", 28)));
        String[] projection = {
            MediaStore.Files.FileColumns._ID,
            MediaStore.Files.FileColumns.MEDIA_TYPE,
            MediaStore.Files.FileColumns.MIME_TYPE,
            MediaStore.Files.FileColumns.DISPLAY_NAME,
            MediaStore.Files.FileColumns.SIZE,
            MediaStore.Files.FileColumns.DATE_ADDED,
            MediaStore.Video.VideoColumns.DURATION
        };
        String selection = MediaStore.Files.FileColumns.MEDIA_TYPE + " IN (?, ?)";
        String[] selectionArgs = {
            String.valueOf(MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE),
            String.valueOf(MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO)
        };
        JSArray items = new JSArray();
        try (Cursor cursor = resolver.query(
                collection,
                projection,
                selection,
                selectionArgs,
                MediaStore.Files.FileColumns.DATE_ADDED + " DESC")) {
            if (cursor == null) {
                rejectOnMain(call, "无法读取系统相册");
                return;
            }
            int idIndex = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns._ID);
            int typeIndex = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.MEDIA_TYPE);
            int mimeIndex = cursor.getColumnIndex(MediaStore.Files.FileColumns.MIME_TYPE);
            int nameIndex = cursor.getColumnIndex(MediaStore.Files.FileColumns.DISPLAY_NAME);
            int sizeIndex = cursor.getColumnIndex(MediaStore.Files.FileColumns.SIZE);
            int dateIndex = cursor.getColumnIndex(MediaStore.Files.FileColumns.DATE_ADDED);
            int durationIndex = cursor.getColumnIndex(MediaStore.Video.VideoColumns.DURATION);
            int skipped = 0;
            int count = 0;
            while (cursor.moveToNext() && count < limit) {
                if (skipped < offset) {
                    skipped++;
                    continue;
                }
                long id = cursor.getLong(idIndex);
                int mediaType = cursor.getInt(typeIndex);
                Uri uri = ContentUris.withAppendedId(collection, id);
                String mime = mimeIndex >= 0 ? cursor.getString(mimeIndex) : null;
                if (mime == null || mime.trim().isEmpty()) {
                    mime = mediaType == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO
                            ? "video/mp4" : "image/jpeg";
                }
                String name = nameIndex >= 0 ? cursor.getString(nameIndex) : null;
                if (name == null || name.trim().isEmpty()) {
                    name = "pulse_media_" + id + (mediaType == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO ? ".mp4" : ".jpg");
                }
                String thumbnail = createThumbnail(resolver, uri, mediaType == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO);
                if (thumbnail.isEmpty()) continue;
                JSObject item = new JSObject();
                item.put("uri", uri.toString());
                item.put("name", name);
                item.put("mimeType", mime);
                item.put("size", sizeIndex >= 0 ? Math.max(0L, cursor.getLong(sizeIndex)) : 0L);
                item.put("duration", durationIndex >= 0 && mediaType == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO
                        ? Math.max(0L, cursor.getLong(durationIndex)) / 1000.0 : 0.0);
                item.put("createdAt", dateIndex >= 0 ? Math.max(0L, cursor.getLong(dateIndex)) : 0L);
                item.put("thumbnail", thumbnail);
                items.put(item);
                count++;
            }
        } catch (Exception error) {
            rejectOnMain(call, "读取系统相册失败: " + error.getMessage(), error);
            return;
        }
        JSObject result = new JSObject();
        result.put("items", items);
        getBridge().executeOnMainThread(() -> call.resolve(result));
    }

    private void rejectOnMain(PluginCall call, String message) {
        getBridge().executeOnMainThread(() -> call.reject(message));
    }

    private void rejectOnMain(PluginCall call, String message, Exception error) {
        getBridge().executeOnMainThread(() -> call.reject(message, error));
    }

    private String createThumbnail(ContentResolver resolver, Uri uri, boolean video) {
        Bitmap bitmap = null;
        MediaMetadataRetriever retriever = null;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // Android 的 MediaStore 缓存缩略图比逐个读取原文件快很多；视频缩略图
                // 由系统从视频内容生成，不再使用统一占位图。
                try {
                    bitmap = resolver.loadThumbnail(uri, new Size(320, 320), null);
                } catch (Exception ignored) {
                    // 某些厂商的 MediaProvider 不支持 loadThumbnail，继续走下方回退逻辑。
                }
            }
            if (bitmap == null && video) {
                retriever = new MediaMetadataRetriever();
                retriever.setDataSource(getContext(), uri);
                bitmap = retriever.getFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
            } else if (bitmap == null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                // 不直接依赖厂商的 MediaStore 缩略图缓存，避免部分设备返回横向撕裂图。
                ImageDecoder.Source source = ImageDecoder.createSource(resolver, uri);
                bitmap = ImageDecoder.decodeBitmap(source, (decoder, info, imageSource) -> {
                    decoder.setAllocator(ImageDecoder.ALLOCATOR_SOFTWARE);
                    decoder.setTargetSize(160, 160);
                });
            } else if (bitmap == null) {
                BitmapFactory.Options options = new BitmapFactory.Options();
                options.inSampleSize = 4;
                try (InputStream input = resolver.openInputStream(uri)) {
                    if (input != null) bitmap = BitmapFactory.decodeStream(input, null, options);
                }
            }
            if (bitmap == null) return "";
            bitmap = scaleThumbnail(bitmap, 320);
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, 88, output);
            return "data:image/jpeg;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
        } catch (Exception ignored) {
            return "";
        } finally {
            if (bitmap != null) bitmap.recycle();
            if (retriever != null) {
                try {
                    retriever.release();
                } catch (Exception ignored) {
                    // ignore release failures from vendor media providers
                }
            }
        }
    }

    private Bitmap scaleThumbnail(Bitmap source, int maxSize) {
        int width = source.getWidth();
        int height = source.getHeight();
        int longest = Math.max(width, height);
        if (longest <= maxSize) return source;
        float ratio = (float) maxSize / (float) longest;
        int targetWidth = Math.max(1, Math.round(width * ratio));
        int targetHeight = Math.max(1, Math.round(height * ratio));
        Bitmap scaled = Bitmap.createScaledBitmap(source, targetWidth, targetHeight, true);
        if (scaled != source) source.recycle();
        return scaled;
    }

    /** 将用户在应用内相册选中的原始媒体读回 WebView，保持原图/原视频发送能力。 */
    @PluginMethod
    public void readMedia(PluginCall call) {
        String uriText = call.getString("uri", "");
        if (uriText.trim().isEmpty()) {
            call.reject("媒体地址为空");
            return;
        }
        Uri uri;
        try {
            uri = Uri.parse(uriText);
        } catch (Exception error) {
            call.reject("媒体地址无效", error);
            return;
        }
        if (!"content".equalsIgnoreCase(uri.getScheme())) {
            call.reject("媒体地址无效");
            return;
        }
        try (InputStream input = getContext().getContentResolver().openInputStream(uri);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (input == null) throw new IllegalStateException("无法读取媒体");
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = input.read(buffer)) >= 0) {
                if (read > 0) output.write(buffer, 0, read);
            }
            String mime = getContext().getContentResolver().getType(uri);
            JSObject result = new JSObject();
            result.put("data", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
            result.put("mimeType", mime == null ? "application/octet-stream" : mime);
            result.put("size", output.size());
            call.resolve(result);
        } catch (Exception error) {
            call.reject("读取媒体失败: " + error.getMessage(), error);
        }
    }

    @PluginMethod
    public void ensurePermissions(PluginCall call) {
        String mediaType = call.getString("mediaType", "image");
        if (hasSavePermission(mediaType)) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        requestSavePermissions(call, mediaType, "ensurePermissionsCallback");
    }

    @PermissionCallback
    private void ensurePermissionsCallback(PluginCall call) {
        if (!hasSavePermission(call.getString("mediaType", "image"))) {
            call.reject("未获得存储权限，无法保存到本地");
            return;
        }
        JSObject result = new JSObject();
        result.put("granted", true);
        call.resolve(result);
    }

    @PluginMethod
    public void download(PluginCall call) {
        enqueueDownload(call, false);
    }

    /**
     * 打开已经由 WebView 取得的文件数据，不再通过 DownloadManager 重复请求服务器。
     * 文件只写入应用缓存目录，外部应用通过 FileProvider 临时读取。
     */
    @PluginMethod
    public void openData(PluginCall call) {
        String encodedData = call.getString("data");
        String requestedName = call.getString("filename", "pulse_file_" + System.currentTimeMillis());
        String mimeType = call.getString("mimeType", "application/octet-stream");
        if (encodedData == null || encodedData.isEmpty()) {
            call.reject("文件数据为空");
            return;
        }
        try {
            File folder = new File(getContext().getCacheDir(), "pulse-open");
            if (!folder.exists() && !folder.mkdirs()) {
                throw new IllegalStateException("无法创建文件缓存目录");
            }
            File target = uniqueFile(folder, sanitizeFilename(requestedName));
            byte[] bytes = Base64.decode(encodedData, Base64.DEFAULT);
            try (FileOutputStream output = new FileOutputStream(target, false)) {
                output.write(bytes);
                output.flush();
            }
            openWithSystemApp(target, mimeType);
            JSObject result = new JSObject();
            result.put("uri", FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                target
            ).toString());
            call.resolve(result);
        } catch (Exception error) {
            call.reject("打开文件失败: " + error.getMessage(), error);
        }
    }

    @PluginMethod
    public void downloadAndOpen(PluginCall call) {
        enqueueDownload(call, true);
    }

    private void enqueueDownload(PluginCall call, boolean openAfterDownload) {
        String url = call.getString("url");
        String requestedName = call.getString("filename", "pulse_file_" + System.currentTimeMillis());
        String mimeType = call.getString("mimeType", "application/octet-stream");
        if (url == null || url.trim().isEmpty()) {
            call.reject("下载地址为空");
            return;
        }
        try {
            File folder = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (folder == null) throw new IllegalStateException("无法访问下载目录");
            if (!folder.exists() && !folder.mkdirs()) throw new IllegalStateException("无法创建下载目录");
            File target = uniqueFile(folder, sanitizeFilename(requestedName));
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setTitle(target.getName());
            request.setDescription("Pulse 正在下载文件");
            request.setMimeType(mimeType);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            // DownloadManager 不稳定地支持 file:// 目标，尤其是 Android 7+；
            // 使用应用专属 external-files 目录既不需要媒体权限，也能通过 FileProvider 打开。
            request.setDestinationInExternalFilesDir(
                getContext(),
                Environment.DIRECTORY_DOWNLOADS,
                target.getName()
            );
            String authorization = call.getString("authorization");
            if (authorization != null && !authorization.trim().isEmpty()) {
                request.addRequestHeader("Authorization", authorization.trim());
            }
            DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager == null) throw new IllegalStateException("系统下载服务不可用");
            long downloadId = manager.enqueue(request);
            if (openAfterDownload) {
                pendingDownloads.put(downloadId, new PendingDownload(target, mimeType, true));
                pollDownload(manager, downloadId);
            }
            JSObject result = new JSObject();
            result.put("downloadId", downloadId);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("视频下载失败: " + error.getMessage(), error);
        }
    }

    private void pollDownload(DownloadManager manager, long expectedId) {
        downloadHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (expectedId < 0 || !pendingDownloads.containsKey(expectedId)) return;
                try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(expectedId))) {
                    if (cursor != null && cursor.moveToFirst()) {
                        int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                        if (status == DownloadManager.STATUS_SUCCESSFUL) {
                            PendingDownload pending = pendingDownloads.remove(expectedId);
                            if (pending != null && pending.openAfterDownload && pending.target != null) {
                                openWithSystemApp(pending.target, pending.mimeType);
                            }
                            return;
                        }
                        if (status == DownloadManager.STATUS_FAILED) {
                            pendingDownloads.remove(expectedId);
                            return;
                        }
                    }
                } catch (Exception ignored) {
                    pendingDownloads.remove(expectedId);
                    return;
                }
                downloadHandler.postDelayed(this, 500L);
            }
        }, 500L);
    }

    private void openWithSystemApp(File file, String mimeType) {
        Uri uri = FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            file
        );
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, mimeType);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(Intent.createChooser(intent, "选择应用打开"));
        } catch (Exception firstError) {
            intent.setDataAndType(uri, "application/octet-stream");
            try {
                getContext().startActivity(Intent.createChooser(intent, "选择应用打开"));
            } catch (Exception ignored) {
                // The file remains accessible from the completed-download notification.
            }
        }
    }

    @PluginMethod
    public void save(PluginCall call) {
        String mediaType = call.getString("mediaType", "image");
        if (!hasSavePermission(mediaType)) {
            requestSavePermissions(call, mediaType, "legacyStorageCallback");
            return;
        }
        saveToGallery(call);
    }

    @PermissionCallback
    private void legacyStorageCallback(PluginCall call) {
        String mediaType = call.getString("mediaType", "image");
        if (!hasSavePermission(mediaType)) {
            call.reject("未获得存储权限，无法保存到相册");
            return;
        }
        saveToGallery(call);
    }

    private boolean hasSavePermission(String mediaType) {
        // Android 10 (API 29) 起，通过 MediaStore 写入相册/影片库无需任何存储权限。
        // Android 13 的 READ_MEDIA_IMAGES / READ_MEDIA_VIDEO 只影响“读取”他人媒体，保存不需要。
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return true;
        }
        // API 28 及以下：需要写外部存储权限
        return getPermissionState("legacyStorage") == PermissionState.GRANTED;
    }

    private void requestSavePermissions(PluginCall call, String mediaType, String callbackName) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // 无需权限，直接视为已授权
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        requestPermissionForAlias("legacyStorage", call, callbackName);
    }

    private void saveToGallery(PluginCall call) {
        String encodedData = call.getString("data");
        String requestedName = call.getString("filename", "pulse_" + System.currentTimeMillis() + ".jpg");
        String mimeType = call.getString("mimeType", "image/jpeg");
        String mediaType = call.getString("mediaType", "image");

        if (encodedData == null || encodedData.isEmpty()) {
            call.reject("媒体数据为空");
            return;
        }

        String filename = sanitizeFilename(requestedName);
        try {
            byte[] bytes = Base64.decode(encodedData, Base64.DEFAULT);
            String savedUri = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? saveWithMediaStore(bytes, filename, mimeType, mediaType)
                : saveLegacy(bytes, filename, mimeType, mediaType);
            JSObject result = new JSObject();
            result.put("uri", savedUri);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("保存到系统相册失败: " + error.getMessage(), error);
        }
    }

    private String saveWithMediaStore(byte[] bytes, String filename, String mimeType, String mediaType) throws Exception {
        boolean video = "video".equals(mediaType);
        Uri collection = video
            ? MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
            : MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
        values.put(
            MediaStore.MediaColumns.RELATIVE_PATH,
            (video ? Environment.DIRECTORY_MOVIES : Environment.DIRECTORY_PICTURES) + File.separator + "PulseIM"
        );
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);

        ContentResolver resolver = getContext().getContentResolver();
        Uri uri = resolver.insert(collection, values);
        if (uri == null) throw new IllegalStateException("系统未能创建相册文件");
        try {
            try (OutputStream output = resolver.openOutputStream(uri)) {
                if (output == null) throw new IllegalStateException("无法打开相册文件");
                output.write(bytes);
                output.flush();
            }
            values.clear();
            values.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(uri, values, null, null);
            return uri.toString();
        } catch (Exception error) {
            resolver.delete(uri, null, null);
            throw error;
        }
    }

    @SuppressWarnings("deprecation")
    private String saveLegacy(byte[] bytes, String filename, String mimeType, String mediaType) throws Exception {
        File root = Environment.getExternalStoragePublicDirectory(
            "video".equals(mediaType) ? Environment.DIRECTORY_MOVIES : Environment.DIRECTORY_PICTURES
        );
        File folder = new File(root, "PulseIM");
        if (!folder.exists() && !folder.mkdirs()) throw new IllegalStateException("无法创建相册目录");
        File target = uniqueFile(folder, filename);
        try (OutputStream output = new FileOutputStream(target)) {
            output.write(bytes);
            output.flush();
        }
        MediaScannerConnection.scanFile(
            getContext(),
            new String[] { target.getAbsolutePath() },
            new String[] { mimeType },
            null
        );
        return Uri.fromFile(target).toString();
    }

    private File uniqueFile(File folder, String filename) {
        File candidate = new File(folder, filename);
        if (!candidate.exists()) return candidate;
        int dot = filename.lastIndexOf('.');
        String stem = dot > 0 ? filename.substring(0, dot) : filename;
        String extension = dot > 0 ? filename.substring(dot) : "";
        return new File(folder, stem + "_" + System.currentTimeMillis() + extension);
    }

    private String sanitizeFilename(String filename) {
        String sanitized = filename.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        return sanitized.isEmpty() ? "pulse_" + System.currentTimeMillis() + ".jpg" : sanitized;
    }
}
