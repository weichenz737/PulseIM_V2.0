<script setup lang="ts">
import { computed, ref, useAttrs, watch } from 'vue'
import { resolveAvatarUrl } from '@/api/file'
import {
  getCachedUserAvatar,
  isCacheableAvatarUrl,
  loadCachedUserAvatar,
} from '@/stores/avatarCache'
import { useUserStore } from '@/stores/user'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    src?: string
    name?: string
    /** 无头像时使用的稳定昵称，避免好友备注变化导致占位头像变化 */
    initialName?: string
    size?: number | string
    round?: boolean
    userId?: string
    kind?: 'user' | 'group'
  }>(),
  {
    src: '',
    name: '?',
    size: 42,
    round: true,
    userId: '',
    kind: 'user',
  },
)

const attrs = useAttrs()
const userStore = useUserStore()
const broken = ref(false)
const displaySrc = ref('')
let loadSequence = 0

const resolved = computed(() => resolveAvatarUrl(props.src || ''))
const showImg = computed(() => !!displaySrc.value && !broken.value)
const initial = computed(() => (props.initialName || props.name || '?').trim().slice(0, 1) || '?')
const passthroughAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})
const boxStyle = computed(() => {
  const s = typeof props.size === 'number' ? `${props.size}px` : String(props.size)
  return {
    width: s,
    height: s,
    borderRadius: props.round ? '50%' : '8px',
  }
})

async function hydrate() {
  const sequence = ++loadSequence
  const source = resolved.value
  const targetId = String(props.userId || '').trim()
  const ownerId = String(userStore.userId || '').trim()

  broken.value = false
  if (!source) {
    displaySrc.value = ''
    return
  }

  // Keep the previous image visible while a changed source is being hydrated.
  // Both protected downloads and legacy raw avatar endpoints are fetched once
  // into the account/avatar cache so remounts do not flash or hit the network.
  if (!targetId || !isCacheableAvatarUrl(source)) {
    displaySrc.value = source
    return
  }

  const cached = getCachedUserAvatar(ownerId, targetId, source, props.kind)
  if (cached) {
    displaySrc.value = cached
    return
  }

  const loaded = await loadCachedUserAvatar(ownerId, targetId, source, props.kind)
  if (sequence !== loadSequence) return
  if (loaded) displaySrc.value = loaded
}

watch(
  [resolved, () => props.userId, () => props.kind, () => userStore.userId, () => userStore.token],
  () => {
    void hydrate()
  },
  { immediate: true },
)

function onError() {
  broken.value = true
}
</script>

<template>
  <img
    v-if="showImg"
    v-bind="passthroughAttrs"
    :src="displaySrc"
    :alt="name"
    :class="['user-avatar', attrs.class]"
    :style="[boxStyle, attrs.style]"
    loading="lazy"
    decoding="async"
    @error="onError"
  />
  <div
    v-else
    v-bind="passthroughAttrs"
    class="user-avatar initials"
    :class="attrs.class"
    :style="[boxStyle, attrs.style]"
  >{{ initial }}</div>
</template>

<style scoped>
.user-avatar {
  display: block;
  object-fit: cover;
  flex-shrink: 0;
  background: var(--pulse-surface-high);
  border: 1px solid rgba(65, 71, 85, 0.2);
}

.user-avatar.initials {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 600;
  color: var(--pulse-primary);
  background: var(--pulse-surface-highest);
}
</style>
