import { Network, type ConnectionStatus } from '@capacitor/network'

export type NetworkStatus = ConnectionStatus

export const getNetworkStatus = () => Network.getStatus()
export const onNetworkStatusChange = (
  listener: (status: ConnectionStatus) => void,
) => Network.addListener('networkStatusChange', listener)
