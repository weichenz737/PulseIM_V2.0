<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from '@/utils/elementFeedback'
import { useRoute } from 'vue-router'
import {
  fetchClientLoginMethods,
  fetchClientRegisterConfig,
  fetchClientWalletConfig,
  saveClientLoginMethods,
  saveClientRegisterConfig,
  saveClientWalletConfig,
  type ClientAccessConfig,
} from '@/api/clientAccess'

const route = useRoute()
const isRegisterPage = computed(() => route.name === 'ClientRegister')
const isWalletPage = computed(() => route.name === 'ClientWallet')
const loading = ref(true)
const saving = ref(false)
const form = reactive<ClientAccessConfig>({
  windowsPhoneLoginEnabled: true,
  windowsQrLoginEnabled: true,
  windowsRegisterEnabled: true,
  windowsWalletEnabled: true,
})

async function load() {
  loading.value = true
  try {
    const config = isRegisterPage.value
      ? await fetchClientRegisterConfig()
      : isWalletPage.value
        ? await fetchClientWalletConfig()
      : await fetchClientLoginMethods()
    Object.assign(form, config)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '客户端配置加载失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    if (isRegisterPage.value) {
      await saveClientRegisterConfig(form.windowsRegisterEnabled)
      ElMessage.success('客户端注册开关已保存')
    } else if (isWalletPage.value) {
      await saveClientWalletConfig(form.windowsWalletEnabled)
      ElMessage.success('客户端钱包开关已保存')
    } else {
      await saveClientLoginMethods({
        windowsPhoneLoginEnabled: form.windowsPhoneLoginEnabled,
        windowsQrLoginEnabled: form.windowsQrLoginEnabled,
      })
      ElMessage.success('客户端登录方式已保存')
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
watch(() => route.name, () => { void load() })
</script>

<template>
  <div v-loading="loading" class="client-access-page">
    <el-card shadow="never">
      <template #header>
        <div class="card-heading">
          <div>
            <strong>{{ isRegisterPage ? '客户端注册开关' : isWalletPage ? '客户端钱包开关' : '客户端登录方式' }}</strong>
            <p>
              {{ isRegisterPage
                ? '控制 Windows 网页端和 Windows EXE 是否显示注册入口。'
                : isWalletPage
                  ? '控制 Windows 网页端和 Windows EXE 是否显示钱包入口、发红包和转账入口。'
                  : '控制 Windows 网页端和 Windows EXE 可使用的登录方式。' }}
            </p>
          </div>
          <el-tag type="info">Windows</el-tag>
        </div>
      </template>

      <div v-if="isRegisterPage" class="switch-list">
        <div class="switch-row">
          <div>
            <strong>Windows 注册</strong>
            <span>关闭后，电脑网页端和 EXE 不显示注册入口，也无法提交注册请求。</span>
          </div>
          <el-switch v-model="form.windowsRegisterEnabled" />
        </div>
      </div>

      <div v-else-if="isWalletPage" class="switch-list">
        <div class="switch-row">
          <div>
            <strong>Windows 钱包</strong>
            <span>关闭后，电脑网页端和 Windows EXE 不显示钱包入口、发红包和转账入口；聊天中收到的红包和转账仍可查看、领取。</span>
          </div>
          <el-switch v-model="form.windowsWalletEnabled" />
        </div>
      </div>

      <div v-else class="switch-list">
        <div class="switch-row">
          <div>
            <strong>手机号登录</strong>
            <span>控制使用手机号和密码登录电脑网页端、Windows EXE。</span>
          </div>
          <el-switch v-model="form.windowsPhoneLoginEnabled" />
        </div>
        <el-divider />
        <div class="switch-row">
          <div>
            <strong>扫码登录</strong>
            <span>控制使用手机 Pulse 扫码登录电脑网页端、Windows EXE。</span>
          </div>
          <el-switch v-model="form.windowsQrLoginEnabled" />
        </div>
      </div>

      <div class="form-footer">
        <span>关闭后会立即对新的登录和注册请求生效。</span>
        <el-button type="primary" :loading="saving" @click="save">保存配置</el-button>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.client-access-page { max-width: 900px; }
.card-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
.card-heading strong { font-size: 18px; color: #1f2d3d; }
.card-heading p { margin: 8px 0 0; color: #8492a6; font-size: 13px; }
.switch-list { padding: 8px 0 2px; }
.switch-row { display: flex; align-items: center; justify-content: space-between; gap: 24px; min-height: 62px; }
.switch-row strong { display: block; color: #303133; font-size: 15px; }
.switch-row span { display: block; margin-top: 6px; color: #909399; font-size: 13px; line-height: 1.5; }
.form-footer { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-top: 26px; padding-top: 18px; border-top: 1px solid #ebeef5; color: #909399; font-size: 13px; }
@media (max-width: 680px) { .form-footer { align-items: flex-start; flex-direction: column; } }
</style>
