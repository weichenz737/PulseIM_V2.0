package com.pulse.im;

import android.graphics.Color;
import android.os.Build;
import android.content.Context;
import android.util.DisplayMetrics;
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
            int bottomPx = 0;
            int leftPx = 0;
            int rightPx = 0;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                WindowInsets insets = getActivity().getWindow().getDecorView().getRootWindowInsets();
                if (insets != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        topPx = insets.getInsets(WindowInsets.Type.statusBars()).top;
                        android.graphics.Insets navigation = insets.getInsets(WindowInsets.Type.navigationBars());
                        bottomPx = navigation.bottom;
                        leftPx = navigation.left;
                        rightPx = navigation.right;
                    } else {
                        topPx = insets.getStableInsetTop();
                        bottomPx = insets.getStableInsetBottom();
                        leftPx = insets.getStableInsetLeft();
                        rightPx = insets.getStableInsetRight();
                    }
                }
            }
            if (topPx <= 0) {
                int id = getContext().getResources().getIdentifier("status_bar_height", "dimen", "android");
                if (id > 0) topPx = getContext().getResources().getDimensionPixelSize(id);
            }
            // Older Android versions keep the WebView above the navigation bar.
            // Only add padding when the WebView actually extends underneath it.
            if (getBridge() != null && getBridge().getWebView() != null) {
                View webView = getBridge().getWebView();
                int[] location = new int[2];
                webView.getLocationOnScreen(location);
                DisplayMetrics display = new DisplayMetrics();
                getActivity().getWindowManager().getDefaultDisplay().getRealMetrics(display);
                if (location[1] + webView.getHeight() <= display.heightPixels - bottomPx / 2) bottomPx = 0;
                if (location[0] >= leftPx / 2) leftPx = 0;
                if (location[0] + webView.getWidth() <= display.widthPixels - rightPx / 2) rightPx = 0;
            }
            float density = getContext().getResources().getDisplayMetrics().density;
            JSObject result = new JSObject();
            result.put("top", density > 0 ? topPx / density : topPx);
            result.put("bottom", density > 0 ? bottomPx / density : bottomPx);
            result.put("left", density > 0 ? leftPx / density : leftPx);
            result.put("right", density > 0 ? rightPx / density : rightPx);
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
            window.setNavigationBarColor(backgroundColor);
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
                    int bars = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                        | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                    controller.setSystemBarsAppearance(darkIcons ? bars : 0, bars);
                }
            } else {
                int flags = window.getDecorView().getSystemUiVisibility();
                if (darkIcons) {
                    flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                } else {
                    flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
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
