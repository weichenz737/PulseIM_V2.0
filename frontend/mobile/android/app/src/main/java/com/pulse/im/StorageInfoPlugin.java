package com.pulse.im;

import android.os.StatFs;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

/** Device/app storage metrics for the storage-management screen. */
@CapacitorPlugin(name = "StorageInfo")
public class StorageInfoPlugin extends Plugin {
    @PluginMethod
    public void getInfo(PluginCall call) {
        try {
            File dataDir = getContext().getDataDir();
            StatFs stat = new StatFs(dataDir.getAbsolutePath());
            long total = Math.max(0L, stat.getTotalBytes());
            long available = Math.max(0L, stat.getAvailableBytes());
            long used = Math.max(0L, directorySize(dataDir));
            File external = getContext().getExternalFilesDir(null);
            if (external != null && !external.getAbsolutePath().startsWith(dataDir.getAbsolutePath())) {
                used += Math.max(0L, directorySize(external));
            }
            JSObject result = new JSObject();
            result.put("totalBytes", total);
            result.put("availableBytes", available);
            result.put("appUsedBytes", used);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("无法读取设备存储空间", error);
        }
    }

    private long directorySize(File file) {
        if (file == null || !file.exists()) return 0L;
        if (file.isFile()) return file.length();
        File[] children = file.listFiles();
        if (children == null) return 0L;
        long total = 0L;
        for (File child : children) {
            long size = directorySize(child);
            if (Long.MAX_VALUE - total < size) return Long.MAX_VALUE;
            total += size;
        }
        return total;
    }
}
