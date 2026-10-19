package com.pulse.im;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;

/**
 * 前台保活服务：锁屏/退后台时保持进程与 WebSocket 连接不被系统冻结，
 * 确保能及时收到新消息并弹出通知。通知本身为最低优先级、无声音。
 */
public class PulseKeepAliveService extends Service {

    private static final String CHANNEL_ID = "pulse_keepalive";
    private static final int NOTIFICATION_ID = 0x50A0D6F;

    @Override
    public void onCreate() {
        super.onCreate();
        ensureChannel();
        startForeground(NOTIFICATION_ID, buildNotification());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager =
                (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "消息连接服务",
                NotificationManager.IMPORTANCE_MIN);
        channel.setShowBadge(false);
        channel.setSound(null, null);
        manager.createNotificationChannel(channel);
    }

    private Notification buildNotification() {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Pulse")
                .setContentText("保持消息连接，确保及时收到新消息")
                .setSmallIcon(R.drawable.ic_stat_pulse)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .build();
    }
}
