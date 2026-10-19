package com.pulse.im;

import android.app.DownloadManager;
import android.content.*;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

@CapacitorPlugin(name = "PulseUpdater")
public class UpdaterPlugin extends Plugin {
    private static final String PREFS = "pulse_updater";
    private long downloadId = -1;
    private final Handler progressHandler = new Handler(Looper.getMainLooper());
    private long lastBytes = 0;
    private long lastProgressAt = 0;
    private File downloadedApk;
    private boolean installerLaunched = false;
    private boolean awaitingInstallPermission = false;
    private boolean autoLaunchInstaller = false;
    private long lastInstallerLaunchAt = 0L;
    private final Runnable progressPoller = new Runnable() {
        @Override public void run() {
            if (downloadId < 0) return;
            DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager == null) return;
            Cursor cursor = null;
            boolean terminal = false;
            try {
                cursor = manager.query(new DownloadManager.Query().setFilterById(downloadId));
                if (cursor != null && cursor.moveToFirst()) {
                    long downloaded = cursor.getLong(cursor.getColumnIndexOrThrow(
                            DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                    long total = cursor.getLong(cursor.getColumnIndexOrThrow(
                            DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                    int rawStatus = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                    int reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
                    long now = System.currentTimeMillis();
                    long elapsed = lastProgressAt > 0 ? Math.max(1, now - lastProgressAt) : 0;
                    long speed = elapsed > 0 ? Math.max(0, (downloaded - lastBytes) * 1000L / elapsed) : 0;
                    lastBytes = downloaded;
                    lastProgressAt = now;

                    String status = "pending";
                    if (rawStatus == DownloadManager.STATUS_RUNNING) status = "running";
                    else if (rawStatus == DownloadManager.STATUS_PAUSED) status = "paused";
                    else if (rawStatus == DownloadManager.STATUS_SUCCESSFUL) status = "completed";
                    else if (rawStatus == DownloadManager.STATUS_FAILED) status = "failed";
                    terminal = rawStatus == DownloadManager.STATUS_SUCCESSFUL
                            || rawStatus == DownloadManager.STATUS_FAILED;

                    JSObject event = new JSObject();
                    event.put("downloadId", downloadId);
                    event.put("downloadedBytes", Math.max(0, downloaded));
                    event.put("totalBytes", Math.max(0, total));
                    event.put("remainingBytes", total > 0 ? Math.max(0, total - downloaded) : 0);
                    event.put("percent", total > 0 ? Math.min(100,
                            Math.round(downloaded * 10000.0 / total) / 100.0) : 0);
                    event.put("speedBytesPerSecond", speed);
                    event.put("status", status);
                    event.put("reason", reason);
                    notifyListeners("downloadProgress", event);
                    if (rawStatus == DownloadManager.STATUS_SUCCESSFUL && autoLaunchInstaller) {
                        launchInstaller();
                    }
                }
            } catch (Exception ignored) {
            } finally {
                if (cursor != null) cursor.close();
            }
            if (!terminal && downloadId >= 0) progressHandler.postDelayed(this, 500);
        }
    };

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        String name = call.getString("fileName", "Pulse-update.apk").replaceAll("[^a-zA-Z0-9._-]", "_");
        if (url == null || url.isEmpty()) { call.reject("url required"); return; }
        try {
            File downloadsDir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (downloadsDir == null) {
                call.reject("无法访问下载目录");
                return;
            }
            File target = new File(downloadsDir, name);
            String savedUrl = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .getString("url", "");
            restoreDownload();
            if (url.equals(savedUrl) && target.isFile() && target.length() > 0) {
                downloadedApk = target;
                installerLaunched = false;
                awaitingInstallPermission = false;
                autoLaunchInstaller = true;
                launchInstaller();
                JSObject reused = new JSObject();
                reused.put("downloadId", downloadId);
                reused.put("reused", true);
                call.resolve(reused);
                return;
            }
            if (url.equals(savedUrl) && downloadId >= 0 && isDownloadActiveOrComplete(downloadId)) {
                downloadedApk = target;
                autoLaunchInstaller = true;
                progressHandler.removeCallbacks(progressPoller);
                progressHandler.post(progressPoller);
                JSObject resumed = new JSObject();
                resumed.put("downloadId", downloadId);
                resumed.put("reused", true);
                call.resolve(resumed);
                return;
            }
            if (target.exists() && !target.delete()) {
                call.reject("无法替换旧安装包，请稍后重试");
                return;
            }
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url))
                    .setTitle("Pulse 新版本")
                    .setDescription("安装包正在下载")
                    .setAllowedOverMetered(true)
                    .setAllowedOverRoaming(true)
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    .setMimeType("application/vnd.android.package-archive")
                    .setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS, name);
            DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager == null) {
                call.reject("系统下载服务不可用");
                return;
            }
            downloadId = manager.enqueue(request);
            downloadedApk = target;
            getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                    .putLong("downloadId", downloadId)
                    .putString("path", target.getAbsolutePath())
                    .putString("url", url)
                    .apply();
            installerLaunched = false;
            awaitingInstallPermission = false;
            autoLaunchInstaller = true;
            lastBytes = 0;
            lastProgressAt = System.currentTimeMillis();
            progressHandler.removeCallbacks(progressPoller);
            progressHandler.post(progressPoller);
            JSObject result = new JSObject();
            result.put("downloadId", downloadId);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("启动下载失败", error);
        }
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        restoreDownload();
        try {
            DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager != null && downloadId >= 0) {
                manager.remove(downloadId);
            }
            progressHandler.removeCallbacks(progressPoller);
            downloadId = -1;
            downloadedApk = null;
            installerLaunched = false;
            awaitingInstallPermission = false;
            autoLaunchInstaller = false;
            lastBytes = 0;
            lastProgressAt = 0;
            getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .remove("downloadId")
                    .remove("path")
                    .remove("url")
                    .apply();
            call.resolve();
        } catch (Exception error) {
            call.reject("取消下载失败", error);
        }
    }

    @PluginMethod
    public void getDownloadState(PluginCall call) {
        restoreDownload();
        JSObject state = queryState();
        if (downloadId >= 0) {
            progressHandler.removeCallbacks(progressPoller);
            progressHandler.post(progressPoller);
        }
        call.resolve(state);
    }

    @PluginMethod
    public void openInstaller(PluginCall call) {
        restoreDownload();
        installerLaunched = false;
        awaitingInstallPermission = false;
        autoLaunchInstaller = true;
        launchInstaller();
        call.resolve();
    }

    private void restoreDownload() {
        android.content.SharedPreferences prefs =
                getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (downloadId < 0) downloadId = prefs.getLong("downloadId", -1L);
        if (downloadedApk == null) {
            String path = prefs.getString("path", "");
            if (!path.isEmpty()) downloadedApk = new File(path);
        }
    }

    private boolean isDownloadActiveOrComplete(long id) {
        DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) return false;
        try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(id))) {
            if (cursor == null || !cursor.moveToFirst()) return false;
            int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            return status == DownloadManager.STATUS_PENDING
                    || status == DownloadManager.STATUS_RUNNING
                    || status == DownloadManager.STATUS_PAUSED
                    || status == DownloadManager.STATUS_SUCCESSFUL;
        }
    }

    private JSObject queryState() {
        JSObject event = new JSObject();
        event.put("downloadId", downloadId);
        event.put("downloadedBytes", 0);
        event.put("totalBytes", 0);
        event.put("remainingBytes", 0);
        event.put("percent", 0);
        event.put("speedBytesPerSecond", 0);
        event.put("status", "pending");
        if (downloadId < 0) return event;
        DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) return event;
        try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(downloadId))) {
            if (cursor == null || !cursor.moveToFirst()) return event;
            long downloaded = Math.max(0, cursor.getLong(cursor.getColumnIndexOrThrow(
                    DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)));
            long total = Math.max(0, cursor.getLong(cursor.getColumnIndexOrThrow(
                    DownloadManager.COLUMN_TOTAL_SIZE_BYTES)));
            int rawStatus = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            String status = rawStatus == DownloadManager.STATUS_RUNNING ? "running"
                    : rawStatus == DownloadManager.STATUS_PAUSED ? "paused"
                    : rawStatus == DownloadManager.STATUS_SUCCESSFUL ? "completed"
                    : rawStatus == DownloadManager.STATUS_FAILED ? "failed" : "pending";
            event.put("downloadedBytes", downloaded);
            event.put("totalBytes", total);
            event.put("remainingBytes", total > 0 ? Math.max(0, total - downloaded) : 0);
            event.put("percent", total > 0 ? Math.min(100,
                    Math.round(downloaded * 10000.0 / total) / 100.0) : 0);
            event.put("status", status);
        } catch (Exception ignored) {}
        return event;
    }

    private final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
            if (id != downloadId) return;
            if (autoLaunchInstaller) launchInstaller();
        }
    };

    private void emitInstallStatus(String status, String message) {
        JSObject event = new JSObject();
        event.put("downloadId", downloadId);
        event.put("downloadedBytes", downloadedApk != null && downloadedApk.isFile()
                ? downloadedApk.length() : Math.max(0, lastBytes));
        event.put("totalBytes", downloadedApk != null && downloadedApk.isFile()
                ? downloadedApk.length() : Math.max(0, lastBytes));
        event.put("remainingBytes", 0);
        event.put("percent", 100);
        event.put("speedBytesPerSecond", 0);
        event.put("status", status);
        if (message != null && !message.isEmpty()) event.put("message", message);
        notifyListeners("downloadProgress", event);
    }

    private void launchInstaller() {
        if (downloadedApk == null || !downloadedApk.isFile()) return;
        if (installerLaunched && System.currentTimeMillis() - lastInstallerLaunchAt < 1500L) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    && !getContext().getPackageManager().canRequestPackageInstalls()) {
                if (awaitingInstallPermission) return;
                awaitingInstallPermission = true;
                emitInstallStatus("permission_required", "请允许 Pulse 安装应用");
                Intent permission = new Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getContext().getPackageName()));
                if (permission.resolveActivity(getContext().getPackageManager()) == null) {
                    permission = new Intent(Settings.ACTION_SECURITY_SETTINGS);
                }
                getActivity().startActivity(permission);
                return;
            }

            Uri uri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    downloadedApk);
            Intent install = new Intent(Intent.ACTION_INSTALL_PACKAGE)
                    .setDataAndType(uri, "application/vnd.android.package-archive")
                    .putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true)
                    .putExtra(Intent.EXTRA_RETURN_RESULT, true)
                    .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP
                            | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            install.setClipData(ClipData.newRawUri("Pulse update", uri));
            if (install.resolveActivity(getContext().getPackageManager()) == null) {
                emitInstallStatus("install_failed", "系统中没有可用的安装器");
                return;
            }
            installerLaunched = true;
            autoLaunchInstaller = false;
            lastInstallerLaunchAt = System.currentTimeMillis();
            awaitingInstallPermission = false;
            emitInstallStatus("installing", "");
            for (android.content.pm.ResolveInfo info :
                    getContext().getPackageManager().queryIntentActivities(install, 0)) {
                getContext().grantUriPermission(
                        info.activityInfo.packageName,
                        uri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION);
            }
            getActivity().startActivity(install);
        } catch (Exception error) {
            installerLaunched = false;
            autoLaunchInstaller = false;
            emitInstallStatus("install_failed", "打开安装页面失败：" + error.getMessage());
        }
    }

    @Override public void load() {
        restoreDownload();
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (android.os.Build.VERSION.SDK_INT >= 33) {
            getContext().registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(receiver, filter);
        }
        if (downloadId >= 0) progressHandler.post(progressPoller);
    }

    @Override protected void handleOnDestroy() {
        progressHandler.removeCallbacks(progressPoller);
        try { getContext().unregisterReceiver(receiver); } catch (Exception ignored) {}
        super.handleOnDestroy();
    }

    @Override protected void handleOnResume() {
        super.handleOnResume();
        restoreDownload();
        if (downloadedApk != null && downloadedApk.isFile() && awaitingInstallPermission) {
            awaitingInstallPermission = false;
            installerLaunched = false;
            progressHandler.postDelayed(this::launchInstaller, 250);
        }
    }
}
