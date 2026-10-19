package com.pulse.im;

import android.graphics.Color;
import android.os.Bundle;
import android.os.Build;
import android.content.Intent;
import android.content.SharedPreferences;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String SHELL_PREFS = "pulse_native_shell";
    private static final String WINDOW_BACKGROUND_COLOR = "window_background_color";
    private static final String DEFAULT_BACKGROUND_COLOR = "#121317";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(MediaGalleryPlugin.class);
        registerPlugin(StorageInfoPlugin.class);
        registerPlugin(SystemBarPlugin.class);
        registerPlugin(UpdaterPlugin.class);
        registerPlugin(PulseBadge.class);
        super.onCreate(savedInstanceState);
        // Keep the edge-to-edge decision after BridgeActivity has initialized
        // its window. Some MIUI/HyperOS builds otherwise restore the default
        // fitting mode during the parent onCreate and leave a black inset.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // Xiaomi devices may add a black contrast scrim over a transparent
            // status bar even when the app supplies the backdrop itself.
            getWindow().setStatusBarContrastEnforced(false);
            getWindow().setNavigationBarContrastEnforced(false);
        }
        ContextCompat.startForegroundService(this, new Intent(this, PulseKeepAliveService.class));
        WebView webView = getBridge().getWebView();
        SharedPreferences shellPrefs = getSharedPreferences(SHELL_PREFS, MODE_PRIVATE);
        String backgroundValue = shellPrefs.getString(WINDOW_BACKGROUND_COLOR, DEFAULT_BACKGROUND_COLOR);
        int backgroundColor = parseColorOrDefault(backgroundValue);
        webView.setBackgroundColor(backgroundColor);
        getWindow().getDecorView().setBackgroundColor(backgroundColor);
        WebSettings webSettings = webView.getSettings();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            webSettings.setAlgorithmicDarkeningAllowed(false);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            webSettings.setForceDark(WebSettings.FORCE_DARK_OFF);
        }
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
    }

    private static int parseColorOrDefault(String value) {
        try {
            return Color.parseColor(value);
        } catch (IllegalArgumentException exception) {
            return Color.parseColor(DEFAULT_BACKGROUND_COLOR);
        }
    }
}
