import http, { type ApiResult } from './http'

export type ContainerMigrationStatus = 'IDLE' | 'PREPARED' | 'READY' | 'ACTIVE' | string

export interface ContainerConfig {
  currentServerOrigin: string
  targetServerOrigin: string
  targetConfigured: boolean
  migrateLegacyData: boolean
  migrationStatus: ContainerMigrationStatus
  migrationMessage: string
  migrationStartedAt?: string
  migrationUpdatedAt?: string
  updatedAt?: string
  controlMode: string
  agentConnected: boolean
  credentialsStored?: boolean
  sharedResourcesProtected: boolean
  cleanupScope: string[]
  protectedScope: string[]
  dataMigrationScope: string[]
  dataMigrationExcludedScope: string[]
}

export type ContainerSshAuthType = 'PASSWORD' | 'PRIVATE_KEY'

export interface ContainerSshRequest {
  host: string
  port: number
  username: string
  authType: ContainerSshAuthType
  password?: string
  privateKey?: string
  privateKeyPassphrase?: string
  hostKeyFingerprint?: string
}

export interface SshOperationResult {
  connected?: boolean
  success?: boolean
  operation?: string
  host: string
  port?: number
  username?: string
  hostKeyFingerprint: string
  hostKeyVerified?: boolean
  message?: string
  output?: string
}

export interface ContainerDataMigrationRequest {
  source: ContainerSshRequest
  target: ContainerSshRequest
  confirmText?: string
}

export interface DataMigrationResult {
  success: boolean
  operation: string
  sourceHost: string
  targetHost: string
  sourceOutput?: string
  targetOutput?: string
  minioSourceOutput?: string
  minioTargetOutput?: string
  minio?: {
    buckets: Array<{
      label: string
      sourceBucket: string
      targetBucket: string
      objectCount: number
      bytes: number
      verified?: boolean
      exists?: boolean
    }>
    verified: boolean
  }
  targetBackupPath?: string
  output?: string
  message?: string
}

const LEGACY_DATA_PREVIEW_TIMEOUT_MS = 120_000
const LEGACY_DATA_MIGRATION_TIMEOUT_MS = 60 * 60 * 1000

export async function fetchContainerConfig(): Promise<ContainerConfig> {
  const { data } = await http.get<ApiResult<ContainerConfig>>('/admin/container-config')
  return data.data
}

export async function updateContainerTarget(
  targetServerOrigin: string,
  migrateLegacyData: boolean,
): Promise<ContainerConfig> {
  const { data } = await http.put<ApiResult<ContainerConfig>>('/admin/container-config', {
    targetServerOrigin,
    migrateLegacyData,
  })
  return data.data
}

export async function prepareContainerMigration(): Promise<ContainerConfig> {
  const { data } = await http.post<ApiResult<ContainerConfig>>('/admin/container-config/prepare')
  return data.data
}

export async function activateContainerMigration(): Promise<ContainerConfig> {
  const { data } = await http.post<ApiResult<ContainerConfig>>('/admin/container-config/migration/activate')
  return data.data
}

export async function testContainerSsh(payload: ContainerSshRequest): Promise<SshOperationResult> {
  const { data } = await http.post<ApiResult<SshOperationResult>>('/admin/container-config/ssh/test', payload)
  return data.data
}

export async function preflightContainerSsh(payload: ContainerSshRequest): Promise<SshOperationResult> {
  const { data } = await http.post<ApiResult<SshOperationResult>>('/admin/container-config/ssh/preflight', payload)
  return data.data
}

export async function previewLegacyDataMigration(payload: ContainerDataMigrationRequest): Promise<DataMigrationResult> {
  const { data } = await http.post<ApiResult<DataMigrationResult>>(
    '/admin/container-config/migration/preview', payload, { timeout: LEGACY_DATA_PREVIEW_TIMEOUT_MS })
  return data.data
}

export async function startLegacyDataMigration(payload: ContainerDataMigrationRequest): Promise<DataMigrationResult> {
  const { data } = await http.post<ApiResult<DataMigrationResult>>(
    '/admin/container-config/migration/start', payload, { timeout: LEGACY_DATA_MIGRATION_TIMEOUT_MS })
  return data.data
}

export async function previewOldContainerCleanup(payload: ContainerSshRequest): Promise<SshOperationResult> {
  const { data } = await http.post<ApiResult<SshOperationResult>>('/admin/container-config/cleanup-old/preview', payload)
  return data.data
}

export async function cleanupOldContainerProject(payload: {
  ssh: ContainerSshRequest
  confirmText: string
}): Promise<SshOperationResult> {
  const { data } = await http.post<ApiResult<SshOperationResult>>('/admin/container-config/cleanup-old', payload)
  return data.data
}
