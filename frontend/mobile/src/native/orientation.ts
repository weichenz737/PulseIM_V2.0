import {
  ScreenOrientation,
  type OrientationLockType,
  type ScreenOrientationResult,
} from '@capacitor/screen-orientation'

export const getOrientation = () => ScreenOrientation.orientation()
export const unlockOrientation = () => ScreenOrientation.unlock()
export const lockOrientation = (orientation: OrientationLockType) =>
  ScreenOrientation.lock({ orientation })
export const onOrientationChange = (
  listener: (event: ScreenOrientationResult) => void,
) => ScreenOrientation.addListener('screenOrientationChange', listener)
