import { SplashScreen } from '@capacitor/splash-screen'

export function showSplashScreen(autoHide = true, showDuration = 3000) {
  return SplashScreen.show({ autoHide, showDuration })
}

export function hideSplashScreen(fadeOutDuration = 300) {
  return SplashScreen.hide({ fadeOutDuration })
}
