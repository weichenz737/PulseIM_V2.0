package com.pulse.im;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.lang.reflect.Method;
import java.util.Locale;

/**
 * Desktop (launcher) icon badge.
 *
 * Pure self-developed implementation without any third-party push SDK or
 * badge library. Covers the mainstream Android launchers:
 *   - Xiaomi / MIUI
 *   - Huawei / Honor (EMUI / Magic UI)
 *   - Samsung
 *   - OPPO (ColorOS) / realme
 *   - vivo (Funtouch OS)
 *   - Sony, LG, HTC, ASUS, Nova, and generic notification-number launchers
 *
 * The notification-bar unread summary is handled by the JS layer through the
 * Capacitor LocalNotifications plugin; this plugin only touches the launcher
 * icon badge so it stays independent from vendor push extensions.
 */
@CapacitorPlugin(name = "PulseBadge")
public class PulseBadge extends Plugin {

    private static final String BADGE_CHANNEL_ID = "pulse_badge_fallback";
    private static final int BADGE_FALLBACK_NOTIFICATION_ID = 0x50A0D6E;

    @PluginMethod
    public void setCount(PluginCall call) {
        Integer raw = call.getInt("count", 0);
        int count = Math.max(0, Math.min(999, raw == null ? 0 : raw));
        try {
            applyLauncherBadge(count);
        } catch (Exception ignored) {
            // Badges are best-effort; a vendor quirk must never break messaging.
        }
        JSObject result = new JSObject();
        result.put("count", count);
        call.resolve(result);
    }

    private Context ctx() {
        return getContext();
    }

    private String mainActivityClassName() {
        try {
            Intent launch = ctx().getPackageManager()
                    .getLaunchIntentForPackage(ctx().getPackageName());
            if (launch != null && launch.getComponent() != null) {
                return launch.getComponent().getClassName();
            }
        } catch (Exception ignored) {
            // Fall through to the reflection fallback.
        }
        try {
            return getActivity().getClass().getName();
        } catch (Exception ignored) {
            return ctx().getPackageName();
        }
    }

    private String launcherPackage() {
        try {
            Intent home = new Intent(Intent.ACTION_MAIN);
            home.addCategory(Intent.CATEGORY_HOME);
            ResolveInfo resolveInfo = ctx().getPackageManager()
                    .resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY);
            if (resolveInfo != null && resolveInfo.activityInfo != null) {
                return resolveInfo.activityInfo.packageName;
            }
        } catch (Exception ignored) {
            // Unknown launcher.
        }
        return null;
    }

    private void applyLauncherBadge(int count) {
        String launcher = launcherPackage();
        String brand = (String.valueOf(Build.BRAND) + " " + String.valueOf(Build.MANUFACTURER))
                .toLowerCase(Locale.ROOT);
        if (launcher == null) {
            tryAll(count);
            return;
        }

        String lower = launcher.toLowerCase(Locale.ROOT);
        boolean handled = true;
        if (lower.contains("miui") || lower.contains("xiaomi")) {
            applyXiaomi(count);
        } else if (lower.contains("huawei") || lower.contains("emui") || lower.contains("honor") || lower.contains("magic")) {
            applyHuawei(count);
        } else if (lower.contains("samsung") || lower.contains("sec")) {
            applySamsung(count);
        } else if (lower.contains("oppo") || lower.contains("coloros")
                || lower.contains("oplus") || lower.contains("realme")
                || brand.contains("oppo") || brand.contains("realme") || brand.contains("oneplus")) {
            // OPPO / realme / OnePlus 的桌面启动器包名可能是 com.android.launcher，
            // 仅靠包名无法识别，需结合设备品牌判断。
            applyOppo(count);
        } else if (lower.contains("vivo") || lower.contains("iqoo") || lower.contains("funtouch")) {
            applyVivo(count);
        } else if (lower.contains("sony") || lower.contains("sonimobile")) {
            applySony(count);
        } else if (lower.contains("lge") || lower.contains("lg")) {
            applyLg(count);
        } else if (lower.contains("htc")) {
            applyHtc(count);
        } else if (lower.contains("tesla") || lower.contains("nova")) {
            applyNova(count);
        } else if (lower.contains("asus")) {
            applyAsus(count);
        } else {
            handled = false;
        }

        if (!handled) {
            // Unknown launcher: try every vendor once. Every implementation is
            // guarded, and vendor-specific classes/providers/broadcasts simply
            // do not exist on other devices, so this is a safe no-op there.
            tryAll(count);
        }
    }

    private void tryAll(int count) {
        applyXiaomi(count);
        applyHuawei(count);
        applySamsung(count);
        applyOppo(count);
        applyVivo(count);
        applySony(count);
        applyLg(count);
        applyNova(count);
        applyAsus(count);
        applyHtc(count);
    }

    // ------------------------------------------------------------------
    // Xiaomi / MIUI
    // ------------------------------------------------------------------
    private void applyXiaomi(int count) {
        NotificationManager manager =
                (NotificationManager) ctx().getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        try {
            Class<?> miuiNotificationClass = Class.forName("android.app.MiuiNotification");
            Object miuiNotification = miuiNotificationClass.getDeclaredConstructor().newInstance();
            Method setMessageCount = miuiNotificationClass.getMethod("setMessageCount", int.class);
            setMessageCount.invoke(miuiNotification, count);
            Method setLatestEventInfo = miuiNotificationClass.getMethod(
                    "setLatestEventInfo", Context.class, CharSequence.class,
                    CharSequence.class, PendingIntent.class);
            setLatestEventInfo.invoke(miuiNotification, ctx(), "", "", null);
            Method notify = NotificationManager.class.getMethod("notify", int.class, Notification.class);
            notify.invoke(manager, BADGE_FALLBACK_NOTIFICATION_ID, miuiNotification);
        } catch (Throwable ignored) {
            // Newer MIUI accepts the notification number as the badge count.
            try {
                ensureFallbackChannel(manager);
                NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx(), BADGE_CHANNEL_ID)
                        .setContentTitle("")
                        .setContentText("")
                        .setSmallIcon(badgeSmallIcon())
                        .setNumber(count);
                manager.notify(BADGE_FALLBACK_NOTIFICATION_ID, builder.build());
            } catch (Throwable ignored2) {
                // Nothing else we can do.
            }
        }
    }

    // ------------------------------------------------------------------
    // Huawei / Honor (EMUI / Magic UI)
    // ------------------------------------------------------------------
    private void applyHuawei(int count) {
        String className = mainActivityClassName();
        try {
            Intent intent = new Intent("com.huawei.android.launcher.action.UPDATE_APPLICATION_UNREAD_COUNT");
            intent.putExtra("packageName", ctx().getPackageName());
            intent.putExtra("className", className);
            intent.putExtra("unreadCount", count);
            ctx().sendBroadcast(intent);
        } catch (Exception ignored) {
            // Older/closed EMUI builds may reject the broadcast.
        }
        try {
            Intent intent = new Intent("com.hihonor.android.launcher.action.UPDATE_APPLICATION_UNREAD_COUNT");
            intent.putExtra("packageName", ctx().getPackageName());
            intent.putExtra("className", className);
            intent.putExtra("unreadCount", count);
            ctx().sendBroadcast(intent);
        } catch (Exception ignored) {
            // Honor Magic UI broadcast is best-effort.
        }
    }

    // ------------------------------------------------------------------
    // Samsung (TouchWiz / One UI)
    // ------------------------------------------------------------------
    private void applySamsung(int count) {
        String packageName = ctx().getPackageName();
        String className = mainActivityClassName();
        ContentResolver resolver = ctx().getContentResolver();
        Uri uri = Uri.parse("content://com.sec.badge/apps");
        ContentValues values = new ContentValues();
        values.put("package", packageName);
        values.put("class", className);
        values.put("badgecount", count);
        try {
            int updated = resolver.update(uri, values, "package=?", new String[]{packageName});
            if (updated == 0) {
                resolver.insert(uri, values);
            }
        } catch (Exception ignored) {
            // Older Samsung builds use the broadcast fallback below.
        }
        try {
            Intent intent = new Intent("android.intent.action.BADGE_COUNT_UPDATE");
            intent.putExtra("badge_count", count);
            intent.putExtra("badge_count_package_name", packageName);
            intent.putExtra("badge_count_class_name", className);
            ctx().sendBroadcast(intent);
        } catch (Exception ignored) {
            // No receiver on this build.
        }
    }

    // ------------------------------------------------------------------
    // OPPO / realme (ColorOS)
    // ------------------------------------------------------------------
    private void applyOppo(int count) {
        // ColorOS 12+ 桌面角标走 Launcher 的 BadgeProvider（content://com.android.badge/badge），
        // 广播方案在新版系统上已不被监听，必须先写内容提供者。
        applyOppoContentProvider(count);
        String[] actions = { "com.oppo.unsettledevent", "com.oplus.unsettledevent" };
        String[] launchers = { "com.oplus.launcher", "com.oppo.launcher", "com.android.launcher" };
        for (String action : actions) {
            // 全局广播 + 显式指定启动器包名各发一次，规避 Android 8+ 隐式广播限制。
            try {
                Intent intent = new Intent(action);
                intent.putExtra("pakeageName", ctx().getPackageName());
                intent.putExtra("number", count);
                intent.putExtra("upgradeNumber", count);
                ctx().sendBroadcast(intent);
            } catch (Exception ignored) {
                // Requires the user to enable badge permission in launcher settings.
            }
            for (String pkg : launchers) {
                try {
                    Intent intent = new Intent(action).setPackage(pkg);
                    intent.putExtra("pakeageName", ctx().getPackageName());
                    intent.putExtra("number", count);
                    intent.putExtra("upgradeNumber", count);
                    ctx().sendBroadcast(intent);
                } catch (Exception ignored) {
                    // Newer ColorOS builds may not accept the broadcast either.
                }
            }
        }
    }

    private void applyOppoContentProvider(int count) {
        try {
            ContentResolver resolver = ctx().getContentResolver();
            String pkg = ctx().getPackageName();

            // 1) 官方 call 接口：写入数据库并通知启动器刷新图标角标 UI。
            //    新 ColorOS 上仅写数据库不会触发启动器重绘，必须走该接口。
            try {
                android.os.Bundle extras = new android.os.Bundle();
                extras.putString("app_badge_packageName", pkg);
                extras.putInt("app_badge_count", count);
                resolver.call(
                        Uri.parse("content://com.android.badge"),
                        "setAppBadgeCount",
                        null,
                        extras);
            } catch (Exception ignoredCall) {
                // 部分版本受支持名单限制，忽略后走数据库兜底。
            }

            // 2) 数据库兜底：确保记录存在（部分 ROM 只读数据库不依赖 call 的刷新）。
            Uri uri = Uri.parse("content://com.android.badge/badge");
            ContentValues values = new ContentValues();
            values.put("app_package_name", pkg);
            values.put("app_badge_count", count);
            values.put("user_id", 0);
            values.put("profileId", 0);
            values.put("calling_package_name", pkg);
            values.put("update_time", System.currentTimeMillis());
            int updated = resolver.update(uri, values, "app_package_name=?", new String[] { pkg });
            if (updated == 0) {
                // BadgeProvider 的 insert 要求调用方自带稳定 _id，否则抛异常拒绝写入。
                values.put("_id", 0x70000000 | (pkg.hashCode() & 0x0FFFFFFF));
                resolver.insert(uri, values);
            }
        } catch (Exception ignored) {
            // Badge provider missing on non-OPPO devices; best effort.
        }
    }

    // ------------------------------------------------------------------
    // vivo (Funtouch OS)
    // ------------------------------------------------------------------
    private void applyVivo(int count) {
        String packageName = ctx().getPackageName();
        String className = mainActivityClassName();
        ContentResolver resolver = ctx().getContentResolver();
        try {
            ContentValues values = new ContentValues();
            values.put("packageName", packageName);
            values.put("className", className);
            values.put("extra_badge_count", count);
            resolver.update(Uri.parse("content://com.vivo.launcher.badge"), values, null, null);
        } catch (Exception ignored) {
            // Provider missing.
        }
        try {
            ContentValues values = new ContentValues();
            values.put("packageName", packageName);
            values.put("className", className);
            values.put("extra_badge_count", count);
            resolver.update(Uri.parse("content://com.iqoo.secure.badge"), values, null, null);
        } catch (Exception ignored) {
            // Provider missing.
        }
        try {
            Intent intent = new Intent("launcher.action.UPDATE_APP_BADGE");
            intent.putExtra("componentName", packageName + "/" + className);
            intent.putExtra("badgeCount", count);
            ctx().sendBroadcast(intent);
        } catch (Exception ignored) {
            // Legacy broadcast unavailable.
        }
    }

    // ------------------------------------------------------------------
    // Sony
    // ------------------------------------------------------------------
    private void applySony(int count) {
        try {
            ContentValues values = new ContentValues();
            values.put("badge_count", count);
            values.put("package_name", ctx().getPackageName());
            values.put("class_name", mainActivityClassName());
            ctx().getContentResolver().update(
                    Uri.parse("content://com.sonymobile.home.resourceprovider/badge"),
                    values, null, null);
        } catch (Exception ignored) {
            // Provider missing.
        }
    }

    // ------------------------------------------------------------------
    // LG
    // ------------------------------------------------------------------
    private void applyLg(int count) {
        String packageName = ctx().getPackageName();
        String className = mainActivityClassName();
        try {
            ContentValues values = new ContentValues();
            values.put("package", packageName);
            values.put("class", className);
            values.put("badge_count", count);
            ctx().getContentResolver().update(
                    Uri.parse("content://com.lge.launcher2.settings/badge"),
                    values, null, null);
        } catch (Exception ignored) {
            // Provider missing.
        }
        try {
            Intent intent = new Intent("com.lge.launcher2.badge_updated");
            intent.putExtra("package", packageName);
            intent.putExtra("class", className);
            intent.putExtra("badgecount", count);
            ctx().sendBroadcast(intent);
        } catch (Exception ignored) {
            // No receiver.
        }
    }

    // ------------------------------------------------------------------
    // HTC
    // ------------------------------------------------------------------
    private void applyHtc(int count) {
        try {
            Intent intent = new Intent("com.htc.launcher.action.UPDATE_SHORTCUT");
            intent.putExtra("packagename", ctx().getPackageName());
            intent.putExtra("count", count);
            ctx().sendBroadcast(intent);
        } catch (Exception ignored) {
            // No receiver.
        }
        try {
            Intent intent = new Intent("com.htc.launcher.action.SET_NOTIFICATION");
            intent.putExtra("pkg", ctx().getPackageName());
            intent.putExtra("className", mainActivityClassName());
            intent.putExtra("count", count);
            ctx().sendBroadcast(intent);
        } catch (Exception ignored) {
            // No receiver.
        }
    }

    // ------------------------------------------------------------------
    // Nova Launcher
    // ------------------------------------------------------------------
    private void applyNova(int count) {
        try {
            ContentValues values = new ContentValues();
            values.put("tag", ctx().getPackageName() + "/" + mainActivityClassName());
            values.put("notification_count", count);
            ctx().getContentResolver().update(
                    Uri.parse("content://com.teslacoilsw.notification/badge"),
                    values, null, null);
        } catch (Exception ignored) {
            // Provider missing.
        }
    }

    // ------------------------------------------------------------------
    // ASUS
    // ------------------------------------------------------------------
    private void applyAsus(int count) {
        try {
            ContentValues values = new ContentValues();
            values.put("package", ctx().getPackageName());
            values.put("class", mainActivityClassName());
            values.put("badge_count", count);
            ctx().getContentResolver().update(
                    Uri.parse("content://com.asus.launcher.settings/badge"),
                    values, null, null);
        } catch (Exception ignored) {
            // Provider missing.
        }
    }

    private void ensureFallbackChannel(NotificationManager manager) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
                BADGE_CHANNEL_ID, "Badge", NotificationManager.IMPORTANCE_MIN);
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    private int badgeSmallIcon() {
        int resId = ctx().getResources().getIdentifier(
                "ic_stat_pulse", "drawable", ctx().getPackageName());
        return resId != 0 ? resId : android.R.drawable.ic_dialog_info;
    }
}
