import { App, type BackButtonListenerEvent } from '@capacitor/app'

export const getAppInfo = () => App.getInfo()
export const getAppState = () => App.getState()
export const getLaunchUrl = () => App.getLaunchUrl()
export const exitApp = () => App.exitApp()
export const minimizeApp = () => App.minimizeApp()
export const setBackButtonHandlerEnabled = (enabled: boolean) =>
  App.toggleBackButtonHandler({ enabled })

export const onBackButton = (listener: (event: BackButtonListenerEvent) => void) =>
  App.addListener('backButton', listener)
export const onAppStateChange = (
  listener: (state: { isActive: boolean }) => void,
) => App.addListener('appStateChange', listener)
export const onAppUrlOpen = (
  listener: (event: { url: string }) => void,
) => App.addListener('appUrlOpen', listener)
