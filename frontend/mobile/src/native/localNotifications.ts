import {
  type Channel,
  type DeliveredNotificationSchema,
  LocalNotifications,
  type ActionPerformed,
  type ActionType,
  type LocalNotificationDescriptor,
  type LocalNotificationSchema,
  type PendingLocalNotificationSchema,
} from '@capacitor/local-notifications'

export type NativeNotification = LocalNotificationSchema

export async function ensureNotificationPermission(): Promise<boolean> {
  let status = await LocalNotifications.checkPermissions()
  if (status.display === 'prompt') {
    status = await LocalNotifications.requestPermissions()
  }
  return status.display === 'granted'
}

export async function scheduleNotifications(
  notifications: LocalNotificationSchema[],
): Promise<LocalNotificationDescriptor[]> {
  if (!(await ensureNotificationPermission())) {
    throw new Error('Local notification permission was not granted')
  }
  return (await LocalNotifications.schedule({ notifications })).notifications
}

export async function cancelNotifications(
  notifications: LocalNotificationDescriptor[],
) {
  await LocalNotifications.cancel({ notifications })
}

export async function createChannel(channel: Channel): Promise<void> {
  await LocalNotifications.createChannel(channel)
}

export async function removeDeliveredNotifications(
  notifications: DeliveredNotificationSchema[],
) {
  await LocalNotifications.removeDeliveredNotifications({ notifications })
}

export async function removeAllDeliveredNotifications(): Promise<void> {
  await LocalNotifications.removeAllDeliveredNotifications()
}

export async function getPendingNotifications(): Promise<PendingLocalNotificationSchema[]> {
  return (await LocalNotifications.getPending()).notifications
}

export const onNotificationReceived = (
  listener: (notification: LocalNotificationSchema) => void,
) => LocalNotifications.addListener('localNotificationReceived', listener)

export const onNotificationAction = (
  listener: (event: ActionPerformed) => void,
) => LocalNotifications.addListener('localNotificationActionPerformed', listener)

export const registerActionTypes = (types: ActionType[]) =>
  LocalNotifications.registerActionTypes({ types })
