<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from '@/utils/elementFeedback'
import {
  activateContainerMigration,
  cleanupOldContainerProject,
  fetchContainerConfig,
  prepareContainerMigration,
  previewOldContainerCleanup,
  previewLegacyDataMigration,
  preflightContainerSsh,
  startLegacyDataMigration,
  testContainerSsh,
  updateContainerTarget,
  type ContainerConfig,
  type ContainerDataMigrationRequest,
  type ContainerSshRequest,
  type DataMigrationResult,
  type SshOperationResult,
} from '@/api/containerConfig'

const CLEANUP_CONFIRMATION = '确认清理旧服务器项目'
const DATA_MIGRATION_CONFIRMATION = 'MIGRATE_PULSEIM_LEGACY_DATA'

const loading = ref(false)
const saving = ref(false)
const preparing = ref(false)
const activating = ref(false)
const targetTesting = ref(false)
const targetPreflighting = ref(false)
const dataMigrationPreviewing = ref(false)
const dataMigrating = ref(false)
const oldTesting = ref(false)
const cleanupPreviewing = ref(false)
const cleaning = ref(false)
const config = ref<ContainerConfig | null>(null)
const targetResult = ref<SshOperationResult | null>(null)
const targetPreflightResult = ref<SshOperationResult | null>(null)
const dataMigrationPreviewResult = ref<DataMigrationResult | null>(null)
const dataMigrationResult = ref<DataMigrationResult | null>(null)
const oldSshResult = ref<SshOperationResult | null>(null)
const cleanupPreviewResult = ref<SshOperationResult | null>(null)
const cleanupResult = ref<SshOperationResult | null>(null)
const form = reactive({ targetServerOrigin: '', migrateLegacyData: false })

const newSshForm = reactive<ContainerSshRequest>({
  host: '',
  port: 22,
  username: '',
  authType: 'PASSWORD',
  password: '',
  privateKey: '',
  privateKeyPassphrase: '',
  hostKeyFingerprint: '',
})

const oldSshForm = reactive<ContainerSshRequest>({
  host: '',
  port: 22,
  username: '',
  authType: 'PASSWORD',
  password: '',
  privateKey: '',
  privateKeyPassphrase: '',
  hostKeyFingerprint: '',
})
const dataMigrationConfirmText = ref('')
const cleanupConfirmText = ref('')

function applyConfig(data: ContainerConfig) {
  config.value = data
  form.targetServerOrigin = data.targetServerOrigin || ''
  form.migrateLegacyData = data.migrateLegacyData === true
  if (data.targetServerOrigin && !newSshForm.host) {
    const target = hostFromOrigin(data.targetServerOrigin)
    newSshForm.host = target.host
    newSshForm.port = target.port
  }
}

function hostFromOrigin(origin: string): { host: string; port: number } {
  try {
    const url = new URL(origin)
    return { host: url.hostname, port: url.port ? Number(url.port) : 22 }
  } catch {
    return { host: '', port: 22 }
  }
}

function requestOf(source: ContainerSshRequest): ContainerSshRequest {
  return {
    ...source,
    host: source.host.trim(),
    username: source.username.trim(),
    hostKeyFingerprint: source.hostKeyFingerprint?.trim(),
  }
}

async function load() {
  loading.value = true
  try {
    applyConfig(await fetchContainerConfig())
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载系统容器配置失败')
  } finally {
    loading.value = false
  }
}

async function saveTarget() {
  saving.value = true
  try {
    applyConfig(await updateContainerTarget(form.targetServerOrigin.trim(), form.migrateLegacyData))
    targetResult.value = null
    targetPreflightResult.value = null
    ElMessage.success('新服务器地址已保存')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存服务器地址失败')
  } finally {
    saving.value = false
  }
}

async function prepareMigration() {
  if (!config.value?.targetConfigured) {
    ElMessage.warning('请先保存新服务器地址')
    return
  }
  if (form.targetServerOrigin.trim().replace(/\/+$/, '') !== config.value.targetServerOrigin
      || form.migrateLegacyData !== config.value.migrateLegacyData) {
    ElMessage.warning('服务器地址或旧数据迁移选项有未保存修改，请先点击保存')
    return
  }
  try {
    await ElMessageBox.confirm(
      '这一步只登记迁移方案，不会复制数据、切换流量或删除老服务器项目。是否继续？',
      '准备迁移',
      { confirmButtonText: '继续', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  preparing.value = true
  try {
    applyConfig(await prepareContainerMigration())
    ElMessage.success('迁移方案已准备')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '准备迁移失败')
  } finally {
    preparing.value = false
  }
}

async function testTargetSsh() {
  targetTesting.value = true
  try {
    targetResult.value = await testContainerSsh(requestOf(newSshForm))
    targetPreflightResult.value = null
    ElMessage.success('目标服务器 SSH 连接成功，请核对下方主机指纹')
  } catch (error) {
    targetResult.value = null
    ElMessage.error(error instanceof Error ? error.message : '目标服务器 SSH 连接失败')
  } finally {
    targetTesting.value = false
  }
}

async function runTargetPreflight() {
  targetPreflighting.value = true
  try {
    targetPreflightResult.value = await preflightContainerSsh(requestOf(newSshForm))
    ElMessage.success('目标服务器预检通过')
  } catch (error) {
    targetPreflightResult.value = null
    ElMessage.error(error instanceof Error ? error.message : '目标服务器预检失败')
  } finally {
    targetPreflighting.value = false
  }
}

function dataMigrationRequest(confirmText?: string): ContainerDataMigrationRequest {
  return {
    source: requestOf(oldSshForm),
    target: requestOf(newSshForm),
    ...(confirmText ? { confirmText } : {}),
  }
}

async function previewDataMigration() {
  if (!config.value?.migrateLegacyData) {
    ElMessage.warning('请先开启并保存“迁移旧数据”选项')
    return
  }
  dataMigrationPreviewing.value = true
  dataMigrationResult.value = null
  try {
    dataMigrationPreviewResult.value = await previewLegacyDataMigration(dataMigrationRequest())
    dataMigrationConfirmText.value = ''
    ElMessage.success('双端旧数据迁移预检通过')
  } catch (error) {
    dataMigrationPreviewResult.value = null
    ElMessage.error(error instanceof Error ? error.message : '旧数据迁移预检失败')
  } finally {
    dataMigrationPreviewing.value = false
  }
}

async function executeDataMigration() {
  if (!dataMigrationPreviewResult.value?.success) {
    ElMessage.warning('请先完成旧数据迁移预检')
    return
  }
  if (dataMigrationConfirmText.value !== DATA_MIGRATION_CONFIRMATION) {
    ElMessage.warning(`请输入确认文字：${DATA_MIGRATION_CONFIRMATION}`)
    return
  }
  try {
    await ElMessageBox.confirm(
      '将把源服务器的 PulseIM PostgreSQL 数据库、上传目录和 MinIO 对象复制到目标服务器，并覆盖目标 PulseIM 数据库及同名对象。目标端会先保留数据库回滚备份；确认继续？',
      '执行旧数据迁移',
      { confirmButtonText: '开始迁移', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  dataMigrating.value = true
  try {
    dataMigrationResult.value = await startLegacyDataMigration(dataMigrationRequest(dataMigrationConfirmText.value))
    try {
      applyConfig(await fetchContainerConfig())
    } catch {
      // The migration result is already successful; status can be refreshed on the next load.
    }
    ElMessage.success('旧数据迁移完成，请按结果启动并检查目标应用')
  } catch (error) {
    dataMigrationResult.value = null
    ElMessage.error(error instanceof Error ? error.message : '旧数据迁移失败')
  } finally {
    dataMigrating.value = false
  }
}

async function activateMigration() {
  if (!config.value || !['PREPARED', 'READY'].includes(config.value.migrationStatus)) return
  try {
    await ElMessageBox.confirm(
      '请确认新服务器上的 PulseIM 已启动，API 和 WebSocket 健康检查均已通过。确认后，新版 APK/EXE 下次启动会自动切换到新服务器；老服务器项目不会被删除。继续？',
      '切换客户端服务器',
      { confirmButtonText: '确认切换', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  activating.value = true
  try {
    applyConfig(await activateContainerMigration())
    ElMessage.success('客户端服务器切换已启用')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '启用客户端切换失败')
  } finally {
    activating.value = false
  }
}

async function testOldSsh() {
  oldTesting.value = true
  try {
    oldSshResult.value = await testContainerSsh(requestOf(oldSshForm))
    cleanupPreviewResult.value = null
    cleanupResult.value = null
    ElMessage.success('老服务器 SSH 连接成功，请核对下方主机指纹')
  } catch (error) {
    oldSshResult.value = null
    ElMessage.error(error instanceof Error ? error.message : '老服务器 SSH 连接失败')
  } finally {
    oldTesting.value = false
  }
}

async function previewCleanup() {
  cleanupPreviewing.value = true
  cleanupResult.value = null
  try {
    cleanupPreviewResult.value = await previewOldContainerCleanup(requestOf(oldSshForm))
    cleanupConfirmText.value = ''
    ElMessage.success('旧服务器清理预览完成，请确认范围后再执行')
  } catch (error) {
    cleanupPreviewResult.value = null
    ElMessage.error(error instanceof Error ? error.message : '旧服务器清理预览失败')
  } finally {
    cleanupPreviewing.value = false
  }
}

async function executeCleanup() {
  if (!cleanupPreviewResult.value?.success) {
    ElMessage.warning('请先完成旧服务器清理预览')
    return
  }
  if (cleanupConfirmText.value !== CLEANUP_CONFIRMATION) {
    ElMessage.warning(`请输入确认文字：${CLEANUP_CONFIRMATION}`)
    return
  }
  try {
    await ElMessageBox.confirm(
      '将停止并删除老服务器上精确匹配的 PulseIM 应用容器。数据库、Redis、上传文件、其他项目和 Docker 网络不会处理。确认继续？',
      '清理老服务器 PulseIM',
      { confirmButtonText: '确认清理', cancelButtonText: '取消', type: 'error' },
    )
  } catch {
    return
  }
  cleaning.value = true
  try {
    cleanupResult.value = await cleanupOldContainerProject({
      ssh: requestOf(oldSshForm),
      confirmText: cleanupConfirmText.value,
    })
    ElMessage.success('老服务器 PulseIM 容器清理完成')
  } catch (error) {
    cleanupResult.value = null
    ElMessage.error(error instanceof Error ? error.message : '老服务器项目清理失败')
  } finally {
    cleaning.value = false
  }
}

function copyFingerprint(result: SshOperationResult | null) {
  if (!result?.hostKeyFingerprint) return
  const write = navigator.clipboard?.writeText(result.hostKeyFingerprint)
  if (!write) {
    ElMessage.info(result.hostKeyFingerprint)
    return
  }
  void write.then(() => ElMessage.success('主机指纹已复制')).catch(() => ElMessage.info(result.hostKeyFingerprint))
}

function statusType(status?: string): 'success' | 'warning' | 'info' | 'danger' {
  if (status === 'PREPARED' || status === 'READY') return 'warning'
  if (status === 'ACTIVE') return 'success'
  if (status === 'RUNNING') return 'info'
  if (status === 'FAILED') return 'danger'
  return 'info'
}

function statusLabel(status?: string): string {
  if (status === 'PREPARED') return '已准备'
  if (status === 'READY') return '待确认切换'
  if (status === 'ACTIVE') return '客户端已切换'
  if (status === 'IDLE') return '未开始'
  return status || '未知'
}

onMounted(load)
</script>

<template>
  <div v-loading="loading" class="container-config-page">
    <el-alert title="后台临时直连 SSH" type="warning" :closable="false" show-icon>
      <template #default>
        SSH 用户名、密码或私钥只随本次操作发送，不写入数据库和操作日志。系统不会猜测 SSH 用户名；请填写你确认过的账号，并在执行预检或清理前核对主机指纹。
      </template>
    </el-alert>

    <section class="config-section">
      <div class="section-heading">
        <div>
          <h3>服务器地址</h3>
          <p>填写服务器根地址即可，系统会按同一地址访问 /api 和 /ws。</p>
        </div>
        <el-tag v-if="config" :type="config.targetConfigured ? 'success' : 'warning'">
          {{ config.targetConfigured ? '已登记新服务器' : '尚未登记' }}
        </el-tag>
      </div>

      <el-form label-position="top" @submit.prevent="saveTarget">
        <el-form-item label="当前服务器地址">
          <el-input :model-value="config?.currentServerOrigin || '读取中…'" disabled />
        </el-form-item>
        <el-form-item label="新服务器地址">
          <el-input
            v-model="form.targetServerOrigin"
            maxlength="512"
            clearable
            placeholder="例如：https://203.0.113.10:9001"
            @keyup.enter="saveTarget"
          >
            <template #prepend>地址</template>
          </el-input>
          <div class="field-help">没有域名时可直接填写公网 IP；生产环境建议使用 HTTPS。</div>
        </el-form-item>
        <el-form-item label="旧数据迁移">
          <div class="data-migration-choice">
            <el-switch
              v-model="form.migrateLegacyData"
              active-text="迁移旧数据至新服务器"
              inactive-text="不迁移旧数据"
            />
            <p v-if="form.migrateLegacyData" class="choice-warning">开启后，迁移计划将包含 PostgreSQL 业务数据库、/opt/pulseim/data/uploads 以及 MinIO 头像/聊天文件/媒体对象；Redis 缓存、登录会话和 ASR 模型缓存不迁移。当前仍需先完成备份和目标端验证，勾选不会立即复制数据。</p>
            <p v-else class="field-help">关闭后不会把老服务器数据库和上传/聊天文件带到新服务器。</p>
          </div>
        </el-form-item>
        <el-button native-type="submit" type="primary" :loading="saving">保存新服务器地址</el-button>
      </el-form>
    </section>

    <section class="config-section">
      <div class="section-heading">
        <div>
          <h3>新服务器 SSH 与预检</h3>
          <p>每次操作临时建立 SSH 连接，操作结束后立即断开，不需要常驻 Agent。</p>
        </div>
        <el-tag type="success">DIRECT_SSH</el-tag>
      </div>

      <el-form label-position="top" @submit.prevent="testTargetSsh">
        <div class="ssh-grid">
          <el-form-item label="SSH 主机 IP / 主机名">
            <el-input v-model="newSshForm.host" placeholder="例如：203.0.113.10" />
          </el-form-item>
          <el-form-item label="SSH 端口">
            <el-input-number v-model="newSshForm.port" :min="1" :max="65535" controls-position="right" />
          </el-form-item>
          <el-form-item label="SSH 用户名">
            <el-input v-model="newSshForm.username" autocomplete="off" placeholder="请填写已确认的账号" />
          </el-form-item>
          <el-form-item label="认证方式">
            <el-radio-group v-model="newSshForm.authType">
              <el-radio value="PASSWORD">密码</el-radio>
              <el-radio value="PRIVATE_KEY">私钥</el-radio>
            </el-radio-group>
          </el-form-item>
        </div>
        <el-form-item v-if="newSshForm.authType === 'PASSWORD'" label="SSH 密码">
          <el-input v-model="newSshForm.password" type="password" show-password autocomplete="new-password" />
        </el-form-item>
        <template v-else>
          <el-form-item label="SSH 私钥内容">
            <el-input v-model="newSshForm.privateKey" type="textarea" :rows="5" autocomplete="off" placeholder="粘贴私钥内容；不会保存到服务器" />
          </el-form-item>
          <el-form-item label="私钥口令（如有）">
            <el-input v-model="newSshForm.privateKeyPassphrase" type="password" show-password autocomplete="new-password" />
          </el-form-item>
        </template>
        <el-form-item label="已核对的主机指纹">
          <el-input v-model="newSshForm.hostKeyFingerprint" placeholder="先点击测试 SSH，核对指纹后再粘贴，例如 SHA256:…" />
          <div class="field-help">预检要求指纹完全匹配，避免把命令发到错误的服务器。</div>
        </el-form-item>
        <div class="button-row">
          <el-button native-type="submit" type="primary" :loading="targetTesting">测试 SSH 连接</el-button>
          <el-button type="success" :loading="targetPreflighting" @click="runTargetPreflight">执行目标预检</el-button>
        </div>
      </el-form>
      <div v-if="targetResult" class="result-panel">
        <div class="result-heading"><strong>{{ targetResult.message || 'SSH 测试结果' }}</strong><el-tag :type="targetResult.connected ? 'success' : 'danger'">{{ targetResult.connected ? '成功' : '失败' }}</el-tag></div>
        <div class="fingerprint-row"><code>{{ targetResult.hostKeyFingerprint || '未返回主机指纹' }}</code><el-button link type="primary" @click="copyFingerprint(targetResult)">复制指纹</el-button></div>
      </div>
      <div v-if="targetPreflightResult" class="result-panel success-panel">
        <div class="result-heading"><strong>目标服务器预检结果</strong><el-tag type="success">通过</el-tag></div>
        <pre>{{ targetPreflightResult.output }}</pre>
      </div>
    </section>

    <section v-if="config?.migrateLegacyData" class="config-section data-migration-section">
      <div class="section-heading">
        <div>
          <h3>旧数据迁移</h3>
          <p>源服务器填写老服务器 SSH，目标服务器填写新服务器 SSH；两边都必须完成主机指纹核对。</p>
        </div>
        <el-tag type="warning">已开启</el-tag>
      </div>
      <el-alert title="执行前请安排维护窗口" type="warning" :closable="false" show-icon>
        迁移会覆盖目标端 PulseIM 数据库、恢复上传目录，并通过 SSH 隧道复制两端 pulse-api 配置的 MinIO 桶。目标端缺少的桶会自动创建，同名对象会覆盖并在最后按对象数量和总字节数校验。源数据不会删除；目标端 pulse-api 必须处于停止状态。
      </el-alert>
      <div class="migration-endpoint-grid">
        <div><strong>源服务器</strong><span>{{ oldSshForm.host || '未填写' }}:{{ oldSshForm.port }}</span></div>
        <div><strong>目标服务器</strong><span>{{ newSshForm.host || '未填写' }}:{{ newSshForm.port }}</span></div>
      </div>
      <div class="button-row">
        <el-button type="primary" :loading="dataMigrationPreviewing" @click="previewDataMigration">预览旧数据迁移</el-button>
      </div>
      <div v-if="dataMigrationPreviewResult" class="result-panel">
        <div class="result-heading"><strong>{{ dataMigrationPreviewResult.message }}</strong><el-tag type="success">通过</el-tag></div>
        <pre>源服务器：
{{ dataMigrationPreviewResult.sourceOutput }}

目标服务器：
{{ dataMigrationPreviewResult.targetOutput }}

{{ dataMigrationPreviewResult.minioSourceOutput }}

{{ dataMigrationPreviewResult.minioTargetOutput }}</pre>
      </div>
      <div class="confirm-box">
        <el-form label-position="top">
          <el-form-item label="输入确认文字后执行旧数据迁移">
            <el-input v-model="dataMigrationConfirmText" :disabled="!dataMigrationPreviewResult?.success" :placeholder="DATA_MIGRATION_CONFIRMATION" />
          </el-form-item>
          <el-button type="warning" :loading="dataMigrating" :disabled="!dataMigrationPreviewResult?.success || dataMigrationConfirmText !== DATA_MIGRATION_CONFIRMATION" @click="executeDataMigration">
            开始迁移数据库、文件和 MinIO 对象
          </el-button>
        </el-form>
      </div>
      <div v-if="dataMigrationResult" class="result-panel success-panel">
        <div class="result-heading"><strong>{{ dataMigrationResult.message }}</strong><el-tag type="success">完成</el-tag></div>
        <pre>{{ dataMigrationResult.output }}

MinIO 校验结果：{{ dataMigrationResult.minio ? JSON.stringify(dataMigrationResult.minio, null, 2) : '未返回' }}

目标端回滚备份：{{ dataMigrationResult.targetBackupPath }}</pre>
      </div>
    </section>

    <section class="config-section">
      <div class="section-heading">
        <div>
          <h3>迁移流程</h3>
          <p>迁移完成前不会自动删除老服务器上的项目；数据迁移选项只决定迁移计划范围。</p>
        </div>
        <el-button type="warning" :loading="preparing" @click="prepareMigration">登记迁移准备</el-button>
      </div>

      <div class="steps">
        <div class="step-card"><span class="step-number">1</span><div><strong>登记目标</strong><p>保存新服务器 IP 和端口。</p></div></div>
        <div class="step-card"><span class="step-number">2</span><div><strong>SSH 预检</strong><p>检查 Docker 权限和 PulseIM 容器。</p></div></div>
        <div class="step-card"><span class="step-number">3</span><div><strong>{{ config?.migrateLegacyData ? '迁移旧数据并验证' : '迁移应用并验证' }}</strong><p>{{ config?.migrateLegacyData ? '按计划迁移数据库和文件，再检查 API 与 WebSocket。' : '不复制旧数据库和文件，检查目标应用与 API。' }}</p></div></div>
        <div class="step-card"><span class="step-number">4</span><div><strong>清理旧项目</strong><p>确认完成后仅处理 PulseIM 应用容器。</p></div></div>
      </div>

      <div v-if="config" class="status-panel">
        <div class="status-line"><span>当前状态</span><el-tag :type="statusType(config.migrationStatus)">{{ statusLabel(config.migrationStatus) }}</el-tag></div>
        <div class="status-line"><span>执行能力</span><strong>后台临时直连 SSH{{ config.credentialsStored ? '（存在已保存凭据）' : '（不保存凭据）' }}</strong></div>
        <div class="status-line"><span>旧数据</span><strong>{{ config.migrateLegacyData ? '纳入迁移计划' : '不迁移' }}</strong></div>
        <div v-if="config.migrationMessage" class="status-message">{{ config.migrationMessage }}</div>
        <el-alert
          v-if="config.migrationStatus === 'PREPARED' || config.migrationStatus === 'READY'"
          title="客户端尚未切换"
          type="warning"
          :closable="false"
          show-icon
        >
          <template #default>
            <div class="activation-row">
              <span>目标服务器完成启动和健康检查后，点击下方按钮发布新地址。发布前，APK/EXE 仍会连接老服务器。</span>
              <el-button type="success" :loading="activating" @click="activateMigration">确认切换客户端</el-button>
            </div>
          </template>
        </el-alert>
      </div>
      <div v-if="config" class="data-scope-panel">
        <div><strong>开启迁移时包含</strong><ul><li v-for="item in config.dataMigrationScope" :key="item">{{ item }}</li></ul></div>
        <div><strong>始终排除</strong><ul><li v-for="item in config.dataMigrationExcludedScope" :key="item">{{ item }}</li></ul></div>
      </div>
    </section>

    <section class="config-section danger-section">
      <div class="section-heading">
        <div>
          <h3>老服务器 PulseIM 清理</h3>
          <p>只清理老服务器上精确匹配的 PulseIM 应用容器，不关闭服务器，不影响其他项目。</p>
        </div>
        <el-tag type="danger">高风险</el-tag>
      </div>

      <el-alert title="执行前提" type="error" :closable="false" show-icon>
        必须先完成新服务器迁移和验证。系统会拒绝把老服务器 SSH 地址填成已登记的新服务器地址。这里不会删除数据库、Redis、上传文件或 /opt/pulseim 项目目录；如需删除这些内容，必须另行设计和确认。
      </el-alert>
      <el-form label-position="top" class="cleanup-form" @submit.prevent="previewCleanup">
        <div class="ssh-grid">
          <el-form-item label="老服务器 SSH 主机 IP / 主机名">
            <el-input v-model="oldSshForm.host" placeholder="例如：198.51.100.20" />
          </el-form-item>
          <el-form-item label="SSH 端口">
            <el-input-number v-model="oldSshForm.port" :min="1" :max="65535" controls-position="right" />
          </el-form-item>
          <el-form-item label="SSH 用户名">
            <el-input v-model="oldSshForm.username" autocomplete="off" placeholder="请填写已确认的账号" />
          </el-form-item>
          <el-form-item label="认证方式">
            <el-radio-group v-model="oldSshForm.authType">
              <el-radio value="PASSWORD">密码</el-radio>
              <el-radio value="PRIVATE_KEY">私钥</el-radio>
            </el-radio-group>
          </el-form-item>
        </div>
        <el-form-item v-if="oldSshForm.authType === 'PASSWORD'" label="SSH 密码">
          <el-input v-model="oldSshForm.password" type="password" show-password autocomplete="new-password" />
        </el-form-item>
        <template v-else>
          <el-form-item label="SSH 私钥内容">
            <el-input v-model="oldSshForm.privateKey" type="textarea" :rows="5" autocomplete="off" placeholder="粘贴私钥内容；不会保存到服务器" />
          </el-form-item>
          <el-form-item label="私钥口令（如有）">
            <el-input v-model="oldSshForm.privateKeyPassphrase" type="password" show-password autocomplete="new-password" />
          </el-form-item>
        </template>
        <el-form-item label="已核对的老服务器主机指纹">
          <el-input v-model="oldSshForm.hostKeyFingerprint" placeholder="先完成 SSH 指纹核对，再执行清理预览" />
        </el-form-item>
        <div class="button-row">
          <el-button type="primary" :loading="oldTesting" @click="testOldSsh">测试 SSH 连接</el-button>
          <el-button native-type="submit" type="warning" :loading="cleanupPreviewing">预览将清理的容器</el-button>
        </div>
      </el-form>
      <div v-if="oldSshResult" class="result-panel">
        <div class="result-heading"><strong>{{ oldSshResult.message || 'SSH 测试结果' }}</strong><el-tag :type="oldSshResult.connected ? 'success' : 'danger'">{{ oldSshResult.connected ? '成功' : '失败' }}</el-tag></div>
        <div class="fingerprint-row"><code>{{ oldSshResult.hostKeyFingerprint || '未返回主机指纹' }}</code><el-button link type="primary" @click="copyFingerprint(oldSshResult)">复制指纹</el-button></div>
      </div>
      <div v-if="cleanupPreviewResult" class="result-panel">
        <div class="result-heading"><strong>清理预览结果</strong><el-tag type="success">已通过</el-tag></div>
        <pre>{{ cleanupPreviewResult.output }}</pre>
      </div>
      <div class="confirm-box">
        <el-form label-position="top">
          <el-form-item label="输入确认文字后执行清理">
            <el-input v-model="cleanupConfirmText" :disabled="!cleanupPreviewResult?.success" :placeholder="CLEANUP_CONFIRMATION" />
          </el-form-item>
          <el-button type="danger" :loading="cleaning" :disabled="!cleanupPreviewResult?.success || cleanupConfirmText !== CLEANUP_CONFIRMATION" @click="executeCleanup">
            确认只清理 PulseIM 应用容器
          </el-button>
        </el-form>
      </div>
      <div v-if="cleanupResult" class="result-panel success-panel">
        <div class="result-heading"><strong>清理执行结果</strong><el-tag type="success">完成</el-tag></div>
        <pre>{{ cleanupResult.output }}</pre>
      </div>

      <div class="scope-grid">
        <div><h4>允许清理</h4><ul><li v-for="item in config?.cleanupScope || []" :key="item">{{ item }}</li></ul></div>
        <div><h4>默认保护</h4><ul><li v-for="item in config?.protectedScope || []" :key="item">{{ item }}</li></ul></div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.container-config-page { max-width: 1000px; display: grid; gap: 16px; }
.config-section { padding: 24px; background: #fff; border: 1px solid #e4e7ed; border-radius: 8px; }
.section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 22px; }
.section-heading h3 { margin: 0 0 6px; font-size: 17px; color: #303133; }
.section-heading p { margin: 0; font-size: 13px; color: #909399; line-height: 1.6; }
.field-help { margin-top: 6px; color: #909399; font-size: 12px; line-height: 1.6; }
.data-migration-choice { display: grid; gap: 6px; }
.data-migration-choice p { margin: 0; line-height: 1.6; }
.choice-warning { color: #b88230; font-size: 12px; }
.ssh-grid { display: grid; grid-template-columns: 1.4fr .7fr 1fr 1.1fr; gap: 12px; }
.ssh-grid .el-input-number { width: 100%; }
.button-row { display: flex; flex-wrap: wrap; gap: 10px; }
.steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.step-card { display: flex; gap: 10px; min-height: 82px; padding: 14px; border: 1px solid #ebeef5; border-radius: 8px; background: #fafafa; }
.step-number { flex: 0 0 auto; width: 24px; height: 24px; line-height: 24px; border-radius: 50%; background: #409eff; color: #fff; text-align: center; font-size: 13px; }
.step-card strong { color: #303133; font-size: 14px; }
.step-card p { margin: 7px 0 0; color: #909399; font-size: 12px; line-height: 1.5; }
.status-panel, .result-panel { margin-top: 20px; padding: 14px 16px; border-radius: 6px; background: #f5f7fa; color: #606266; font-size: 13px; }
.status-line { display: flex; align-items: center; gap: 12px; min-height: 30px; }
.status-line span { width: 70px; color: #909399; }
.status-message { margin-top: 8px; color: #606266; line-height: 1.6; }
.activation-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
.data-scope-panel { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 16px; padding: 14px 16px; border-radius: 6px; background: #f8f9fb; color: #606266; font-size: 13px; }
.data-scope-panel strong { color: #303133; }
.data-scope-panel ul { margin: 8px 0 0; padding-left: 20px; color: #909399; line-height: 1.8; }
.result-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.fingerprint-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.fingerprint-row code { word-break: break-all; color: #303133; }
.result-panel pre { margin: 0; white-space: pre-wrap; word-break: break-word; color: #606266; font: 12px/1.65 Consolas, monospace; }
.success-panel { background: #f0f9eb; }
.data-migration-section { border-color: #e6a23c; }
.migration-endpoint-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 18px 0; }
.migration-endpoint-grid > div { display: grid; gap: 5px; padding: 12px 14px; border-radius: 6px; background: #fdf6ec; }
.migration-endpoint-grid span { color: #606266; font: 13px/1.5 Consolas, monospace; word-break: break-all; }
.danger-section { border-color: #f5c6cb; }
.cleanup-form { margin-top: 20px; }
.confirm-box { margin-top: 18px; padding: 16px; border: 1px dashed #f56c6c; border-radius: 6px; background: #fff7f7; }
.scope-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 20px; }
.scope-grid > div { padding: 14px 16px; border-radius: 6px; background: #fafafa; }
.scope-grid h4 { margin: 0 0 8px; font-size: 14px; color: #606266; }
.scope-grid ul { margin: 0; padding-left: 20px; color: #909399; font-size: 13px; line-height: 1.9; }
@media (max-width: 900px) { .ssh-grid { grid-template-columns: 1fr 1fr; } .steps { grid-template-columns: 1fr 1fr; } }
@media (max-width: 560px) { .ssh-grid, .steps, .scope-grid, .data-scope-panel, .migration-endpoint-grid { grid-template-columns: 1fr; } .section-heading { flex-direction: column; } }
</style>
