<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from '@/utils/elementFeedback'
import { fetchMapConfig, updateMapConfig, type MapConfig } from '@/api/mapConfig'

const loading = ref(false)
const saving = ref(false)
const source = ref<MapConfig['source']>('none')
const appSource = ref<MapConfig['appSource']>('none')
const configured = ref(false)
const appConfigured = ref(false)
const form = reactive({
  enabled: true,
  ak: '',
  appAk: '',
})

async function load() {
  loading.value = true
  try {
    const data = await fetchMapConfig()
    form.enabled = data.enabled
    form.ak = data.ak || ''
    form.appAk = data.appAk || ''
    source.value = data.source
    appSource.value = data.appSource
    configured.value = data.configured
    appConfigured.value = data.appConfigured
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载地图配置失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    const data = await updateMapConfig({
      enabled: form.enabled,
      ak: form.ak.trim(),
      appAk: form.appAk.trim(),
    })
    form.ak = data.ak || ''
    form.appAk = data.appAk || ''
    source.value = data.source
    appSource.value = data.appSource
    configured.value = data.configured
    appConfigured.value = data.appConfigured
    ElMessage.success('地图配置已保存')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存地图配置失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div v-loading="loading" class="map-config-page">
    <section class="config-section">
      <div class="section-heading">
        <div>
          <h3>百度地图</h3>
          <p>用于用户端位置搜索、地图选点和位置消息展示。</p>
        </div>
        <el-button type="primary" :loading="saving" @click="save">
          <el-icon><Check /></el-icon>
          保存
        </el-button>
      </div>

      <el-form label-position="top">
        <el-form-item label="启用地图功能">
          <el-switch v-model="form.enabled" />
        </el-form-item>
        <el-form-item label="Browser 端 JavaScript API AK">
          <el-input
            v-model="form.ak"
            type="password"
            show-password
            maxlength="256"
            autocomplete="new-password"
            placeholder="留空时使用服务器环境变量 BAIDU_MAP_AK"
          />
        </el-form-item>
        <el-form-item label="App 端 JavaScript API AK">
          <el-input
            v-model="form.appAk"
            type="password"
            show-password
            maxlength="256"
            autocomplete="new-password"
            placeholder="留空时使用 BAIDU_MAP_APP_AK；仍为空则兼容使用网页 AK"
          />
        </el-form-item>
        <div class="status-row">
          <el-tag :type="configured ? 'success' : 'warning'">
            {{ configured ? '已配置' : '未配置' }}
          </el-tag>
          <span>当前来源：{{ source === 'database' ? '后台配置' : source === 'environment' ? '环境变量' : '无' }}</span>
        </div>
        <div class="status-row">
          <el-tag :type="appConfigured ? 'success' : 'warning'">
            {{ appConfigured ? 'App AK 已配置' : 'App AK 未配置' }}
          </el-tag>
          <span>App AK 来源：{{ appSource === 'database' ? '后台配置' : appSource === 'environment' ? '环境变量' : '兼容使用网页 AK' }}</span>
        </div>
      </el-form>
    </section>
  </div>
</template>

<style scoped>
.map-config-page {
  max-width: 900px;
}

.config-section {
  padding: 24px;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
}

.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 22px;
}

.section-heading h3 {
  margin: 0 0 6px;
  font-size: 17px;
  color: #303133;
}

.section-heading p {
  margin: 0;
  font-size: 13px;
  color: #909399;
}

.section-heading .el-button {
  flex-shrink: 0;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #606266;
  font-size: 13px;
}
</style>
