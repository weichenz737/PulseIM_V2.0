import {
  Camera,
  CameraDirection,
  CameraResultType,
  CameraSource,
  type CameraPermissionState,
  type GalleryPhoto,
  type Photo,
} from '@capacitor/camera'

export interface TakePhotoOptions {
  source?: 'camera' | 'photos' | 'prompt'
  quality?: number
  allowEditing?: boolean
  saveToGallery?: boolean
  width?: number
  height?: number
}

const sources = {
  camera: CameraSource.Camera,
  photos: CameraSource.Photos,
  prompt: CameraSource.Prompt,
} as const

export async function takePhoto(options: TakePhotoOptions = {}): Promise<Photo> {
  return Camera.getPhoto({
    resultType: CameraResultType.Uri,
    source: sources[options.source ?? 'prompt'],
    direction: CameraDirection.Rear,
    quality: options.quality ?? 90,
    allowEditing: options.allowEditing ?? false,
    saveToGallery: options.saveToGallery ?? false,
    width: options.width,
    height: options.height,
    correctOrientation: true,
  })
}

export function openCamera(options: Omit<TakePhotoOptions, 'source'> = {}) {
  return takePhoto({ ...options, source: 'camera' })
}

export function openPhotoLibrary(options: Omit<TakePhotoOptions, 'source'> = {}) {
  return takePhoto({ ...options, source: 'photos' })
}

export async function pickImages(limit = 0): Promise<GalleryPhoto[]> {
  const result = await Camera.pickImages({ limit, quality: 90 })
  return result.photos
}

export function checkCameraPermissions() {
  return Camera.checkPermissions()
}

export function requestCameraPermissions(
  permissions: Array<'camera' | 'photos'> = ['camera', 'photos'],
): Promise<{ camera: CameraPermissionState; photos: CameraPermissionState }> {
  return Camera.requestPermissions({ permissions })
}
