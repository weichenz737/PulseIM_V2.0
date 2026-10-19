<script setup lang="ts">
import { ref, watch } from 'vue'
import { fetchAdminMediaBlob, resolveAvatarUrl } from '@/api/files'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  url?: string | null
}>()

// 后台列表、详情和抽屉经常重复展示同一用户，按头像地址复用 Blob URL，
// 避免每个 el-avatar 都重新发起一次鉴权请求。
const avatarCache = new Map<string, string>()
const avatarLoads = new Map<string, Promise<string>>()

const displayUrl = ref('')

function isInlineUrl(url: string) {
  return url.startsWith('data:') || url.startsWith('blob:')
}

function isProtectedAvatarUrl(url: string) {
  if (!/^https?:\/\//i.test(url)) return true
  try {
    const parsed = new URL(url)
    if (parsed.origin === window.location.origin) return true
    return parsed.pathname.includes('/api/v1/files/')
      || parsed.pathname.includes('/api/admin/messages/files/')
  } catch {
    return false
  }
}

function loadAvatar(source: string): Promise<string> {
  const cached = avatarCache.get(source)
  if (cached) return Promise.resolve(cached)
  const existing = avatarLoads.get(source)
  if (existing) return existing

  const loading = fetchAdminMediaBlob(source)
    .then((blob) => {
      const objectUrl = URL.createObjectURL(blob)
      avatarCache.set(source, objectUrl)
      return objectUrl
    })
    .finally(() => {
      avatarLoads.delete(source)
    })
  avatarLoads.set(source, loading)
  return loading
}

let refreshId = 0

async function refresh(url?: string | null) {
  const id = ++refreshId
  const source = resolveAvatarUrl(url || '')
  displayUrl.value = ''
  if (!source) return
  if (isInlineUrl(source) || !isProtectedAvatarUrl(source)) {
    displayUrl.value = source
    return
  }
  try {
    const objectUrl = await loadAvatar(source)
    if (id === refreshId) displayUrl.value = objectUrl
  } catch {
    // 保留组件插槽中的昵称首字母作为无头像兜底。
  }
}

function handleError() {
  displayUrl.value = ''
}

watch(() => props.url, refresh, { immediate: true })
</script>

<template>
  <el-avatar
    v-bind="$attrs"
    :class="['admin-avatar', { 'is-fallback': !displayUrl }]"
    :src="displayUrl || undefined"
    @error="handleError"
  >
    <span v-if="!displayUrl" class="admin-avatar-fallback"><slot /></span>
    <slot v-else />
  </el-avatar>
</template>

<style scoped>
.admin-avatar.is-fallback {
  --el-avatar-bg-color: #e5e7eb;
  --el-avatar-text-color: #2563eb;
  color: #2563eb;
}

.admin-avatar-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: inherit;
  font-weight: 700;
  line-height: 1;
}
</style>
