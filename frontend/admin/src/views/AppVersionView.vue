<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from '@/utils/elementFeedback'
import type { UploadRequestOptions } from 'element-plus'
import { fetchAppVersion, updateAppVersion } from '@/api/appVersion'
import { uploadAppApk } from '@/api/files'

const loading = ref(false)
const saving = ref(false)
const uploading = ref(false)
const form = reactive({
  versionCode: 1,
  versionName: '1.0.0',
  apkUrl: '',
  apkName: '',
  apkSize: 0,
  releaseNotes: '',
  forceUpdate: false,
  enabled: false,
  updatedAt: '',
})

function assign(data: Awaited<ReturnType<typeof fetchAppVersion>>) {
  Object.assign(form, data)
}

async function load() {
  loading.value = true
  try { assign(await fetchAppVersion()) }
  catch (e) { ElMessage.error(e instanceof Error ? e.message : '加载版本配置失败') }
  finally { loading.value = false }
}

async function upload(options: UploadRequestOptions) {
  uploading.value = true
  try {
    const file = options.file as File
    const result = await uploadAppApk(file)
    form.apkUrl = result.url
    form.apkName = result.name || file.name
    form.apkSize = result.size
    form.versionCode = Number(result.versionCode || form.versionCode)
    form.versionName = String(result.versionName || form.versionName)
    options.onSuccess?.(result as never)
    ElMessage.success(`安装包上传成功，版本编号已自动更新为 ${form.versionCode}`)
  } catch (e) {
    options.onError?.(e as never)
    ElMessage.error(e instanceof Error ? e.message : '安装包上传失败')
  } finally { uploading.value = false }
}

async function save() {
  if (!form.versionName.trim()) {
    ElMessage.warning('请填写正确的版本名称')
    return
  }
  saving.value = true
  try {
    assign(await updateAppVersion({ ...form }))
    ElMessage.success('App 版本配置已保存')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '保存失败')
  } finally { saving.value = false }
}

function formatSize(size: number) {
  return size ? `${(size / 1024 / 1024).toFixed(2)} MB` : '—'
}

onMounted(load)
</script>

<template>
  <div v-loading="loading" class="app-version-page">
    <section class="config-card">
      <div class="heading">
        <div><h3>App 新版本</h3><p>发布 Android 安装包，并控制普通更新或强制更新。</p></div>
        <el-button type="primary" :loading="saving" @click="save">保存配置</el-button>
      </div>
      <el-form label-position="top">
        <div class="two-cols">
          <el-form-item label="版本名称（展示给用户）">
            <el-input :model-value="form.versionName" disabled placeholder="上传 APK 后自动读取" />
          </el-form-item>
          <el-form-item label="版本编号（上传 APK 后自动读取）">
            <el-input :model-value="String(form.versionCode)" disabled />
          </el-form-item>
        </div>
        <el-form-item label="Android 安装包">
          <el-upload accept=".apk" :show-file-list="false" :http-request="upload">
            <el-button :loading="uploading">选择并上传 APK</el-button>
          </el-upload>
          <div v-if="form.apkUrl" class="file-info">{{ form.apkName }} · {{ formatSize(form.apkSize) }}</div>
        </el-form-item>
        <el-form-item label="更新说明">
          <el-input v-model="form.releaseNotes" type="textarea" :rows="6" maxlength="4000" show-word-limit />
        </el-form-item>
        <div class="switch-row">
          <span>启用此版本</span><el-switch v-model="form.enabled" />
        </div>
        <div class="switch-row">
          <span>强制用户更新</span><el-switch v-model="form.forceUpdate" />
        </div>
      </el-form>
    </section>
  </div>
</template>

<style scoped>
.app-version-page{max-width:900px}.config-card{padding:24px;background:#fff;border:1px solid #e4e7ed;border-radius:8px}
.heading{display:flex;justify-content:space-between;gap:20px;margin-bottom:22px}.heading h3{margin:0 0 6px}.heading p{margin:0;color:#909399;font-size:13px}
.two-cols{display:grid;grid-template-columns:1fr 1fr;gap:20px}.file-info{margin-left:14px;color:#606266;font-size:13px}
.switch-row{display:flex;align-items:center;justify-content:space-between;max-width:420px;padding:14px 0;border-top:1px solid #ebeef5}
@media(max-width:700px){.two-cols{grid-template-columns:1fr}}
</style>
