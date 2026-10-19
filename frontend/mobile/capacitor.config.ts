import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pulse.im',
  appName: '脉冲',
  webDir: 'dist',
  backgroundColor: '#121317',
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    App: {
      disableBackButtonHandler: true,
    },
    Keyboard: {
      resize: 'native',
      // 不强制所有 Android 机型使用同一种全屏缩放策略。OPPO 等机型
      // 已经由 adjustResize 缩小 WebView，强制 resize 会再次减去 IME 高度；
      // 页面会根据实际 layout/visualViewport 结果为红米等机型补偿。
      resizeOnFullScreen: false,
    },
    StatusBar: {
      // Android 15/16 enforce edge-to-edge for targetSdk 35+.
      // Draw the WebView below the transparent system bar and let the
      // safe-area-aware page header provide the actual bar background.
      overlaysWebView: true,
      style: 'LIGHT',
      backgroundColor: '#00000000',
    },
    SystemBars: {
      // Safe-area values are handled by the app's native plugin and CSS.
      // Do not let Capacitor add top padding to the WebView parent, otherwise
      // the location map starts below the status bar instead of behind it.
      insetsHandling: 'disable',
      style: 'LIGHT',
      hidden: false,
    },
    SplashScreen: {
      // main.ts 会在首帧后主动隐藏；保留原生自动隐藏作为 Android
      // WebView/插件异常时的兜底，避免启动页永久遮挡应用。
      launchAutoHide: true,
      backgroundColor: '#121317',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
  },
};

export default config;
