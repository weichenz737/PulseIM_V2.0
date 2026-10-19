package com.pulse.im;

import android.graphics.Color;
import android.os.Build;
import android.content.Context;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PulseSystemBar")
public class SystemBarPlugin extends Plugin {
    private static final String SHELL_PREFS = "pulse_native_shell";
    private static final String WINDOW_BACKGROUND_COLOR = "window_background_color";

    @PluginMethod
    public void getInsets(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            int topPx = 0;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                WindowInsets insets = getActivity().getWindow().getDecorView().getRootWindowInsets();
                if (insets != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        topPx = insets.getInsets(WindowInsets.Type.statusBars()).top;
                    } else {
                        topPx = insets.getStableInsetTop();
                    }
                }
            }
            if (topPx <= 0) {
                int id = getContext().getResources().getIdentifier("status_bar_height", "dimen", "android");
                if (id > 0) topPx = getContext().getResources().getDimensionPixelSize(id);
            }
            float density = getContext().getResources().getDisplayMetrics().density;
            JSObject result = new JSObject();
            result.put("top", density > 0 ? topPx / density : topPx);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void apply(PluginCall call) {
        String colorValue = call.getString("color", "#121317");
        String backgroundValue = call.getString("backgroundColor", colorValue);
        boolean darkIcons = Boolean.TRUE.equals(call.getBoolean("darkIcons", false));
        final int color;
        final int backgroundColor;
        try {
            color = Color.parseColor(colorValue);
            backgroundColor = Color.parseColor(backgroundValue);
        } catch (IllegalArgumentException exception) {
            call.reject("Invalid system bar color");
            return;
        }

        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();

            // targetSdk 35+ makes the status bar transparent on recent Android.
            // Keep a separate themed backdrop because the decor/window color
            // remains visible in the system-bar inset when the bar is clear.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // MIUI/HyperOS can otherwise add a black contrast scrim over a
                // transparent status bar, regardless of the app theme.
                window.setStatusBarContrastEnforced(false);
                window.setNavigationBarContrastEnforced(false);
            }
            window.getDecorView().setBackgroundColor(backgroundColor);
            window.setStatusBarColor(color);
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().setBackgroundColor(backgroundColor);
            }
            getActivity()
                .getSharedPreferences(SHELL_PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(WINDOW_BACKGROUND_COLOR, backgroundValue)
                .apply();

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                WindowInsetsController controller = window.getInsetsController();
                if (controller != null) {
                    controller.setSystemBarsAppearance(
                        darkIcons ? WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS : 0,
                        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                    );
                }
            } else {
                int flags = window.getDecorView().getSystemUiVisibility();
                if (darkIcons) {
                    flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                } else {
                    flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                }
                window.getDecorView().setSystemUiVisibility(flags);
            }

            JSObject result = new JSObject();
            result.put("color", colorValue);
            result.put("darkIcons", darkIcons);
            call.resolve(result);
        });
    }
}
