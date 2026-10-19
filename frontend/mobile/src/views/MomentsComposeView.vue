<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, onActivated } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { onBeforeRouteLeave } from 'vue-router'
import { showToast, showLoadingToast, closeToast, showImagePreview, showConfirmDialog } from 'vant'
import { checkDynamicContent, publishMoment } from '@/api/moments'
import { publishPost as publishCommunityPost } from '@/api/community'
import { fileDownloadUrl, normalizeUploadContentType, uploadChatFile } from '@/api/file'
import { fetchContacts, type ContactItem } from '@/api/contact'
import { getMapConfig } from '@/api/map'
import { loadBaiduMap } from '@/utils/baiduMap'
import { openMediaVideoPreview } from '@/composables/useMediaVideoPreview'
import { markRouteTransitionBack } from '@/router/transition'
import { isNativeApp, nativeKeyboard } from '@/native'

interface DraftMedia {
  id: string
  file: File
  preview: string
  kind: 'image' | 'video'
}

const MAX_MEDIA = 9
const DRAFT_KEY = 'pulse_moment_draft'

const router = useRouter()
const route = useRoute()
const communityId = computed(() => Number(route.params.id) || 0)
const isCommunity = computed(() => communityId.value > 0 && route.path.startsWith('/communities/'))
const content = ref('')
const media = ref<DraftMedia[]>([])
const publishing = ref(false)
/** 发布成功后的路由离开不再触发草稿确认。 */
const leaveAfterPublish = ref(false)
let leavePromptInFlight = false
let backNavigationInFlight = false
let keyboardBackConsumed = false

/** 0=好友可见 1=仅自己 2=选择好友可见（已取消 3=所有人可见） */
const visibility = ref(0)
const showVisibilitySheet = ref(false)

const contacts = ref<ContactItem[]>([])
const mentionIds = ref<Set<string>>(new Set())
const visibleIds = ref<Set<string>>(new Set())
const showMentionPopup = ref(false)
const showVisiblePopup = ref(false)
const showLocationPopup = ref(false)
const locating = ref(false)
const locationKeyword = ref('')
const locationResults = ref<any[]>([])

/** 文件传输助手是系统账号，不算好友，朋友圈选人时排除 */
function isFileTransferAssistant(c: ContactItem) {
  if (c.nickname === String.fromCodePoint(0x6587, 0x4ef6, 0x4f20, 0x8f93, 0x52a9, 0x624b)) return true
  return !!c.fileTransferAssistant || c.nickname === '文件传输助手'
}

const selectedLocation = ref<{
  name: string
  address: string
  latitude: number
  longitude: number
} | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

const canPublish = computed(
  () => !publishing.value && (content.value.trim().length > 0 || media.value.length > 0),
)

const visibilityLabel = computed(() => {
  if (visibility.value === 1) return '仅自己可见'
  if (visibility.value === 2) return '选择好友可见'
  return '好友可见'
})
const visibilitySub = computed(() => {
  if (visibility.value === 1) return '只有自己能看到'
  if (visibility.value === 2) {
    if (visibleIds.value.size === 0) return '请选择可见好友'
    const names = contacts.value
      .filter((c) => visibleIds.value.has(c.userId))
      .map((c) => c.nickname)
    if (names.length <= 2) return names.join('、')
    return `${names.slice(0, 2).join('、')} 等${names.length}人`
  }
  return '互为好友的人可见'
})
const visibilityIcon = computed(() => {
  if (visibility.value === 1) return 'lock'
  if (visibility.value === 2) return 'person_check'
  return 'group'
})
const visibilityActions = computed(() => [
  { name: `好友可见${visibility.value === 0 ? '  ✓' : ''}`, subname: '互为好友的人可见' },
  { name: `仅自己可见${visibility.value === 1 ? '  ✓' : ''}`, subname: '只有自己能看到' },
  { name: `选择好友可见${visibility.value === 2 ? '  ✓' : ''}`, subname: '仅所选好友可见' },
])

const mentionLabel = computed(() => {
  if (mentionIds.value.size === 0) return ''
  const names = contacts.value
    .filter((c) => mentionIds.value.has(c.userId))
    .map((c) => c.nickname)
  if (names.length <= 2) return names.join('、')
  return `${names.slice(0, 2).join('、')} 等${names.length}人`
})

/** 安卓软键盘：只收缩页面高度，绝不 translateY，避免顶栏被往下推 */
const viewportHeightPx = ref(0)
const textInputRef = ref<HTMLTextAreaElement | null>(null)
const mainRef = ref<HTMLElement | null>(null)
const composerFocused = ref(false)
const nativeKeyboardVisible = ref(false)

function hasComposerDraft() {
  return Boolean(content.value.trim() || media.value.length)
}

function saveDraft() {
  try {
    if (!content.value.trim() && media.value.length === 0) {
      localStorage.removeItem(DRAFT_KEY)
      return
    }
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      content: content.value,
      visibility: visibility.value,
    }))
  } catch {
    // 草稿保存失败不影响编辑
  }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return
    const draft = JSON.parse(raw) as { content?: string; visibility?: number } | null
    if (!draft) return
    if (typeof draft.content === 'string') content.value = draft.content
    if (typeof draft.visibility === 'number') visibility.value = draft.visibility
  } catch {
    // 草稿损坏时忽略
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    // best effort
  }
}

function resetComposerForEntry() {
  // The compose page is kept alive by the mobile router. Re-entering it must
  // rebuild the editor state from the persisted draft instead of reusing the
  // previous in-memory content after the user chose not to save.
  media.value.forEach((item) => URL.revokeObjectURL(item.preview))
  media.value = []
  content.value = ''
  visibility.value = 0
  mentionIds.value = new Set()
  visibleIds.value = new Set()
  selectedLocation.value = null
  showMentionPopup.value = false
  showVisiblePopup.value = false
  showLocationPopup.value = false
  leavePromptInFlight = false
  backNavigationInFlight = false
  leaveAfterPublish.value = false
  keyboardBackConsumed = false
  loadDraft()
}

// 离开编辑页时询问是否保存草稿（覆盖返回按钮与系统返回键）
onBeforeRouteLeave(async () => {
  if (leaveAfterPublish.value) return true
  if (!hasComposerDraft()) return true
  // 返回键被连续点击时，只保留第一次确认，避免历史记录被重复回退。
  if (leavePromptInFlight) return false
  leavePromptInFlight = true
  try {
    await showConfirmDialog({
      title: '是否保存草稿？',
      message: '下次进入发布页可以继续编辑',
      confirmButtonText: '保存草稿',
      cancelButtonText: '不保存',
      confirmButtonColor: '#07c160',
    })
    saveDraft()
  } catch {
    clearDraft()
  } finally {
    leavePromptInFlight = false
  }
  return true
})

function resetDocumentScroll() {
  window.scrollTo(0, 0)
  document.documentElement.scrollTop = 0
  document.body.scrollTop = 0
}

function syncKeyboardInset() {
  const vv = window.visualViewport
  if (!vv) {
    viewportHeightPx.value = Math.round(window.innerHeight)
    return
  }
  // 有键盘时用可视高度；无键盘时用布局高度，避免残留偏移
  const bottomOccluded = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
  viewportHeightPx.value = Math.round(bottomOccluded > 48 ? vv.height : window.innerHeight)
  resetDocumentScroll()
}

function onTextFocus() {
  composerFocused.value = true
  keyboardBackConsumed = false
  syncKeyboardInset()
  window.setTimeout(() => {
    syncKeyboardInset()
    mainRef.value && (mainRef.value.scrollTop = 0)
  }, 80)
  window.setTimeout(syncKeyboardInset, 320)
}

function onTextBlur() {
  composerFocused.value = false
  window.setTimeout(() => {
    syncKeyboardInset()
    resetDocumentScroll()
  }, 80)
}

onMounted(async () => {
  resetComposerForEntry()
  syncKeyboardInset()
    window.visualViewport?.addEventListener('resize', syncKeyboardInset)
  window.visualViewport?.addEventListener('scroll', syncKeyboardInset)
  window.addEventListener('resize', syncKeyboardInset)
  window.addEventListener('pulse:native-back', onNativeBack)
  window.addEventListener('pulse:native-keyboard', onNativeKeyboard)
  try {
    contacts.value = (await fetchContacts()).filter((c) => !isFileTransferAssistant(c))
  } catch {
    contacts.value = []
  }
})

onActivated(() => {
  resetComposerForEntry()
  resetDocumentScroll()
})

onBeforeUnmount(() => {
  window.visualViewport?.removeEventListener('resize', syncKeyboardInset)
  window.visualViewport?.removeEventListener('scroll', syncKeyboardInset)
  window.removeEventListener('resize', syncKeyboardInset)
  window.removeEventListener('pulse:native-back', onNativeBack)
  window.removeEventListener('pulse:native-keyboard', onNativeKeyboard)
  resetDocumentScroll()
  media.value.forEach((m) => URL.revokeObjectURL(m.preview))
})

function dismissComposerKeyboard() {
  const input = textInputRef.value
  try {
    input?.blur()
  } catch {
    // best effort
  }
  const active = document.activeElement as HTMLElement | null
  if (active && active !== document.body && typeof active.blur === 'function') {
    try {
      active.blur()
    } catch {
      // best effort
    }
  }
  if (isNativeApp) void nativeKeyboard.hideKeyboard().catch(() => {})
  composerFocused.value = false
  nativeKeyboardVisible.value = false
  window.setTimeout(() => {
    syncKeyboardInset()
    resetDocumentScroll()
  }, 60)
}

function onNativeKeyboard(event: Event) {
  nativeKeyboardVisible.value = Boolean((event as CustomEvent<{ visible?: boolean }>).detail?.visible)
  if (nativeKeyboardVisible.value) keyboardBackConsumed = false
  else {
    // Android's IME consumes the first hardware-back event before the
    // Capacitor backButton listener is invoked. Treat the native hide as
    // that consumed back so the next back leaves the compose page instead
    // of only clearing the textarea's still-active DOM focus.
    keyboardBackConsumed = true
  }
}

async function goBack() {
  if (backNavigationInFlight || leaveAfterPublish.value || publishing.value) return
  backNavigationInFlight = true
  try {
    if (hasComposerDraft()) {
      leavePromptInFlight = true
      try {
        await showConfirmDialog({
          title: '是否保存草稿？',
          message: '下次进入发布页可以继续编辑',
          confirmButtonText: '保存草稿',
          cancelButtonText: '不保存',
          confirmButtonColor: '#07c160',
        })
        saveDraft()
      } catch {
        clearDraft()
      } finally {
        leavePromptInFlight = false
      }
    }
    leaveAfterPublish.value = true
    dismissComposerKeyboard()
    markRouteTransitionBack()
    const destination = isCommunity.value ? `/communities/${communityId.value}` : '/moments'
    await router.replace(destination)
  } finally {
    backNavigationInFlight = false
  }
}

/** Android 返回键绕过浏览器历史栈，和页面左上角返回使用同一条路径。 */
function onNativeBack(event: Event) {
  const keyboardActive = composerFocused.value
    || nativeKeyboardVisible.value
    || document.activeElement === textInputRef.value
  if (keyboardActive && !keyboardBackConsumed) {
    keyboardBackConsumed = true
    event.preventDefault()
    dismissComposerKeyboard()
    return
  }
  keyboardBackConsumed = false
  event.preventDefault()
  void goBack()
}

function openFilePicker() {
  if (media.value.length >= MAX_MEDIA) {
    showToast(`最多添加 ${MAX_MEDIA} 个图片或视频`)
    return
  }
  fileInputRef.value?.click()
}

function mediaKindOf(file: File): DraftMedia['kind'] | null {
  const type = normalizeUploadContentType(file)
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  return null
}

async function onFilesSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  if (!files.length) return

  const remain = MAX_MEDIA - media.value.length
  if (remain <= 0) {
    showToast(`最多添加 ${MAX_MEDIA} 个图片或视频`)
    return
  }

  const picked = files
    .map((file) => ({ file, kind: mediaKindOf(file) }))
    .filter((entry): entry is { file: File; kind: DraftMedia['kind'] } => !!entry.kind)
    .slice(0, remain)
  if (!picked.length) {
    showToast('请选择图片或视频')
    return
  }
  if (files.length > remain) {
    showToast(`最多还能添加 ${remain} 个`)
  }

  for (const entry of picked) {
    const { file, kind } = entry
    if (file.size > 100 * 1024 * 1024) {
      showToast(`${file.name} 超过 100MB，已跳过`)
      continue
    }
    media.value.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      preview: URL.createObjectURL(file),
      kind,
    })
  }
}

function removeMedia(id: string) {
  const idx = media.value.findIndex((i) => i.id === id)
  if (idx < 0) return
  URL.revokeObjectURL(media.value[idx].preview)
  media.value.splice(idx, 1)
}

function seekVideoThumb(e: Event) {
  const el = e.target as HTMLVideoElement | null
  if (!el) return
  try {
    const d = el.duration
    if (Number.isFinite(d) && d > 0) {
      el.currentTime = Math.min(0.12, d * 0.02)
    }
  } catch {
    /* ignore */
  }
}

function previewMedia(item: DraftMedia) {
  if (item.kind === 'video') {
    void openMediaVideoPreview(item.preview)
    return
  }
  const images = media.value.filter((m) => m.kind === 'image').map((m) => m.preview)
  const start = Math.max(0, images.indexOf(item.preview))
  showImagePreview({
    images,
    startPosition: start,
    closeable: true,
    closeIconPosition: 'top-right',
  })
}

function onVisibilityAction(action: { name?: string }) {
  const name = action.name || ''
  const v = name.startsWith('仅自己可见') ? 1 : name.startsWith('选择好友可见') ? 2 : 0
  visibility.value = v
  showVisibilitySheet.value = false
  if (v === 2) {
    showVisiblePopup.value = true
  }
}

function openVisibility() {
  showVisibilitySheet.value = true
}

function contactName(userId: string) {
  return contacts.value.find((item) => item.userId === userId)?.nickname || '该好友'
}

async function toggleMention(userId: string) {
  const next = new Set(mentionIds.value)
  if (next.has(userId)) {
    next.delete(userId)
    mentionIds.value = next
    return
  }
  if (visibility.value === 1 || (visibility.value === 2 && !visibleIds.value.has(userId))) {
    try {
      await showConfirmDialog({
        title: '好友不在可见范围',
        message: `${contactName(userId)}不在该动态可见范围内，是否将其加入该动态可见范围？不加入则不能提醒该好友。`,
        confirmButtonText: '加入并提醒',
        cancelButtonText: '不加入',
      })
      if (visibility.value === 1) visibility.value = 2
      visibleIds.value = new Set([...visibleIds.value, userId])
    } catch {
      return
    }
  }
  next.add(userId)
  mentionIds.value = next
}

async function toggleVisible(userId: string) {
  const next = new Set(visibleIds.value)
  if (next.has(userId)) {
    if (mentionIds.value.has(userId)) {
      try {
        await showConfirmDialog({
          title: '移出可见范围',
          message: `${contactName(userId)}已在提醒名单中，移出可见范围后将同时取消提醒。`,
          confirmButtonText: '移出',
        })
      } catch {
        return
      }
      const mentions = new Set(mentionIds.value)
      mentions.delete(userId)
      mentionIds.value = mentions
    }
    next.delete(userId)
  } else next.add(userId)
  visibleIds.value = next
}

async function openLocation() {
  showLocationPopup.value = true
  if (locationResults.value.length || locating.value) return
  await locateNearby()
}

async function loadLocationPlaces(longitude: number, latitude: number, keyword = '') {
  const config = await getMapConfig()
  if (!config.configured || !config.ak) throw new Error('地图 AK 尚未配置')
  const BMap = await loadBaiduMap(config.ak)
  const point = new BMap.Point(longitude, latitude)
  if (keyword.trim()) {
    const search = new BMap.LocalSearch(point, { pageCapacity: 20 })
    await new Promise<void>((resolve) => {
      search.setSearchCompleteCallback((result: any) => {
        const list: any[] = []
        const count = Number(result?.getCurrentNumPois?.() || 0)
        for (let i = 0; i < count; i += 1) {
          const poi = result.getPoi(i)
          if (poi?.point) list.push(poi)
        }
        locationResults.value = list
        resolve()
      })
      search.searchNearby(keyword.trim(), point, 5000)
    })
    return
  }
  const geocoder = new BMap.Geocoder()
  await new Promise<void>((resolve) => {
    geocoder.getLocation(point, (result: any) => {
      const pois = Array.isArray(result?.surroundingPois)
        ? result.surroundingPois.filter((item: any) => item?.point).slice(0, 20)
        : []
      locationResults.value = pois
      resolve()
    }, { poiRadius: 2000, numPois: 20 })
  })
}

async function locateNearby() {
  if (!navigator.geolocation) return showToast('当前设备不支持定位')
  locating.value = true
  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      try {
        await loadLocationPlaces(coords.longitude, coords.latitude, locationKeyword.value)
      } catch (error) {
        showToast(error instanceof Error ? error.message : '附近位置加载失败')
      } finally {
        locating.value = false
      }
    },
    () => {
      locating.value = false
      showToast('定位失败，请开启定位权限')
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
  )
}

function selectLocation(item: any) {
  selectedLocation.value = {
    name: String(item.title || '所在位置'),
    address: String(item.address || item.title || ''),
    latitude: Number(item.point.lat),
    longitude: Number(item.point.lng),
  }
  showLocationPopup.value = false
}

function clearLocation() {
  selectedLocation.value = null
  showLocationPopup.value = false
}

function isMentioned(userId: string) {
  return mentionIds.value.has(userId)
}

function isVisibleFriend(userId: string) {
  return visibleIds.value.has(userId)
}

function initials(name: string) {
  return (name || '?').slice(0, 1)
}

function confirmVisibleFriends() {
  if (visibility.value === 2 && visibleIds.value.size === 0) {
    showToast('请至少选择一位好友')
    return
  }
  showVisiblePopup.value = false
}

async function handlePublish() {
  const text = content.value.trim()
  if (!text && media.value.length === 0) {
    showToast('请输入内容或添加图片/视频')
    return
  }
  if (visibility.value === 2 && visibleIds.value.size === 0) {
    showToast('请选择可见好友')
    showVisiblePopup.value = true
    return
  }
  if (publishing.value) return
  if (text) {
    try {
      await checkDynamicContent(text)
    } catch (e) {
      const message = e instanceof Error ? e.message : '内容检查失败'
      if (/敏感词|违禁词/.test(message)) {
        content.value = ''
        showToast('内容包含敏感词，已清空编辑内容')
      } else {
        showToast(message)
      }
      return
    }
  }
  publishing.value = true
  showLoadingToast({ message: '发布中...', forbidClick: true })
  try {
    const urls: string[] = []
    const originalUrls: string[] = []
    const mediaFileIds: string[] = []
    const mediaTypes: Array<'image' | 'video'> = []
    for (let i = 0; i < media.value.length; i++) {
      const item = media.value[i]
      showLoadingToast({
        message:
          media.value.length > 1
            ? `上传中 ${i + 1}/${media.value.length}`
            : item.kind === 'video'
              ? '上传视频...'
              : '上传图片...',
        forbidClick: true,
      })
      // 动态媒体不压缩，原文件上传
      const uploaded = await uploadChatFile(item.file)
      if (!uploaded.fileId) throw new Error('媒体文件引用创建失败，请重试')
      // Keep the post's feed URL on the thumbnail route. If the asynchronous
      // video rendition is not ready yet, the authenticated cache layer will
      // retry this URL instead of silently downloading the original video.
      urls.push(fileDownloadUrl(uploaded.fileId, 'thumb'))
      originalUrls.push(fileDownloadUrl(uploaded.fileId, 'original') || uploaded.originalUrl || uploaded.url)
      mediaFileIds.push(uploaded.fileId)
      mediaTypes.push(item.kind)
    }
    showLoadingToast({ message: '发布中...', forbidClick: true })
    if (isCommunity.value) {
      await publishCommunityPost(communityId.value, {
        content: text,
        images: urls,
        originalImages: originalUrls,
        mediaTypes,
        mediaFileIds,
        video: undefined,
        locationName: selectedLocation.value?.name,
        locationAddress: selectedLocation.value?.address,
        latitude: selectedLocation.value?.latitude,
        longitude: selectedLocation.value?.longitude,
      })
    } else {
      await publishMoment({
        content: text,
        images: urls,
        originalImages: originalUrls,
        mediaTypes,
        mediaFileIds,
        visibility: visibility.value,
        mentionUserIds: [...mentionIds.value],
        visibleUserIds: visibility.value === 2 ? [...visibleIds.value] : [],
        locationName: selectedLocation.value?.name,
        locationAddress: selectedLocation.value?.address,
        latitude: selectedLocation.value?.latitude,
        longitude: selectedLocation.value?.longitude,
      })
    }
    closeToast()
    showToast('发布成功')
    clearDraft()
    leaveAfterPublish.value = true
    await router.replace(isCommunity.value ? `/communities/${communityId.value}` : '/moments')
  } catch (e) {
    closeToast()
    const message = e instanceof Error ? e.message : '发布失败'
    if (/敏感词|违禁词/.test(message)) {
      content.value = ''
      showToast('内容包含敏感词，已清空编辑内容')
    } else {
      showToast(message)
    }
  } finally {
    publishing.value = false
  }
}
</script>

<template>
  <div
    class="compose-page"
    :style="
      viewportHeightPx
        ? {
            height: `${viewportHeightPx}px`,
            maxHeight: `${viewportHeightPx}px`,
          }
        : undefined
    "
  >
    <header class="compose-header glass-header">
      <button type="button" class="icon-btn" @click="goBack">
        <span class="material-symbols-outlined">close</span>
      </button>
      <h1 class="title">发布动态</h1>
      <button
        type="button"
        class="publish-btn"
        :class="{ active: canPublish }"
        :disabled="!canPublish"
        @click="handlePublish"
      >
        发布
      </button>
    </header>

    <main ref="mainRef" class="compose-main">
      <section class="text-section">
        <textarea
          ref="textInputRef"
          v-model="content"
          class="content-input"
          placeholder="这一刻的想法..."
          rows="6"
          maxlength="2000"
          @focus="onTextFocus"
          @blur="onTextBlur"
        />
      </section>

      <section class="image-section">
        <div class="image-grid">
          <div v-for="item in media" :key="item.id" class="image-thumb" @click="previewMedia(item)">
            <video
              v-if="item.kind === 'video'"
              :src="item.preview"
              class="thumb-img"
              muted
              playsinline
              preload="metadata"
              @loadedmetadata="seekVideoThumb"
            />
            <img v-else :src="item.preview" alt="" class="thumb-img" />
            <span v-if="item.kind === 'video'" class="video-badge">
              <span class="material-symbols-outlined">play_circle</span>
            </span>
            <button type="button" class="thumb-remove" @click.stop="removeMedia(item.id)">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <button
            v-if="media.length < MAX_MEDIA"
            type="button"
            class="add-image-btn"
            @click="openFilePicker"
          >
            <span class="material-symbols-outlined add-icon">add</span>
            <span class="add-label">图片/视频</span>
          </button>
        </div>
        <input
          ref="fileInputRef"
          type="file"
          accept="image/*,video/*"
          multiple
          class="hidden-input"
          @change="onFilesSelected"
        />
      </section>

      <section class="options-section">
        <div class="option-item" @click="openLocation">
          <div class="option-left">
            <div class="option-icon-wrap">
              <span class="material-symbols-outlined">location_on</span>
            </div>
            <div>
              <p class="option-title">所在位置</p>
              <p class="option-sub">
                {{ selectedLocation ? `${selectedLocation.name} · ${selectedLocation.address}` : '选择附近位置' }}
              </p>
            </div>
          </div>
          <span class="material-symbols-outlined option-arrow">chevron_right</span>
        </div>

        <template v-if="!isCommunity">
          <div class="option-item" @click="openVisibility">
            <div class="option-left">
              <div class="option-icon-wrap">
                <span class="material-symbols-outlined">{{ visibilityIcon }}</span>
              </div>
              <div>
                <p class="option-title">{{ visibilityLabel }}</p>
                <p class="option-sub">{{ visibilitySub }}</p>
              </div>
            </div>
            <span class="material-symbols-outlined option-arrow">keyboard_arrow_down</span>
          </div>

          <div
            v-if="visibility === 2"
            class="option-item"
            @click="showVisiblePopup = true"
          >
            <div class="option-left">
              <div class="option-icon-wrap">
                <span class="material-symbols-outlined">group_add</span>
              </div>
              <div>
                <p class="option-title">选择可见好友</p>
                <p class="option-sub">{{ visibilitySub }}</p>
              </div>
            </div>
            <span class="material-symbols-outlined option-arrow">chevron_right</span>
          </div>

          <div class="option-item" @click="showMentionPopup = true">
            <div class="option-left">
              <div class="option-icon-wrap">
                <span class="material-symbols-outlined">alternate_email</span>
              </div>
              <div>
                <p class="option-title">提醒谁看</p>
                <p v-if="mentionLabel" class="option-sub">{{ mentionLabel }}</p>
              </div>
            </div>
            <span class="material-symbols-outlined option-arrow">chevron_right</span>
          </div>
        </template>
      </section>

      <div v-if="!isCommunity" class="tip-card">
        <div class="tip-header">
          <span class="material-symbols-outlined tip-icon">auto_awesome</span>
          <p class="tip-title">发布小贴士</p>
        </div>
        <p class="tip-text">最多 9 个图片/视频（原画质上传）；可见范围支持好友、仅自己或指定好友。</p>
      </div>
    </main>

    <van-action-sheet
      v-model:show="showVisibilitySheet"
      :actions="visibilityActions"
      cancel-text="取消"
      close-on-click-action
      @select="onVisibilityAction"
    />

    <van-popup
      v-model:show="showVisiblePopup"
      position="bottom"
      round
      :style="{ height: '70%' }"
    >
      <div class="mention-sheet">
        <div class="mention-header">
          <button type="button" class="mention-cancel" @click="showVisiblePopup = false">取消</button>
          <h3 class="mention-title">选择可见好友</h3>
          <button type="button" class="mention-done" @click="confirmVisibleFriends">完成</button>
        </div>
        <p class="mention-hint">已选 {{ visibleIds.size }} 人</p>
        <div class="mention-list">
          <button
            v-for="c in contacts"
            :key="c.userId"
            type="button"
            class="mention-item"
            @click="toggleVisible(c.userId)"
          >
            <img v-if="c.avatarUrl" :src="c.avatarUrl" alt="" class="mention-avatar" />
            <div v-else class="mention-avatar initials">{{ initials(c.nickname) }}</div>
            <span class="mention-name">{{ c.nickname }}</span>
            <span
              class="material-symbols-outlined mention-check"
              :class="{ on: isVisibleFriend(c.userId) }"
            >
              {{ isVisibleFriend(c.userId) ? 'check_circle' : 'radio_button_unchecked' }}
            </span>
          </button>
          <p v-if="!contacts.length" class="mention-empty">暂无好友可选</p>
        </div>
      </div>
    </van-popup>

    <van-popup
      v-model:show="showMentionPopup"
      position="bottom"
      round
      :style="{ height: '70%' }"
      class="mention-popup"
    >
      <div class="mention-sheet">
        <div class="mention-header">
          <button type="button" class="mention-cancel" @click="showMentionPopup = false">取消</button>
          <h3 class="mention-title">提醒谁看</h3>
          <button type="button" class="mention-done" @click="showMentionPopup = false">完成</button>
        </div>
        <p class="mention-hint">已选 {{ mentionIds.size }} 人</p>
        <div class="mention-list">
          <button
            v-for="c in contacts"
            :key="c.userId"
            type="button"
            class="mention-item"
            @click="toggleMention(c.userId)"
          >
            <img v-if="c.avatarUrl" :src="c.avatarUrl" alt="" class="mention-avatar" />
            <div v-else class="mention-avatar initials">{{ initials(c.nickname) }}</div>
            <span class="mention-name">{{ c.nickname }}</span>
            <span
              class="material-symbols-outlined mention-check"
              :class="{ on: isMentioned(c.userId) }"
            >
              {{ isMentioned(c.userId) ? 'check_circle' : 'radio_button_unchecked' }}
            </span>
          </button>
          <p v-if="!contacts.length" class="mention-empty">暂无好友可提醒</p>
        </div>
      </div>
    </van-popup>

    <van-popup
      v-model:show="showLocationPopup"
      position="bottom"
      round
      :style="{ height: '72%' }"
    >
      <div class="mention-sheet">
        <div class="mention-header">
          <button type="button" class="mention-cancel" @click="showLocationPopup = false">取消</button>
          <h3 class="mention-title">所在位置</h3>
          <button type="button" class="mention-done" @click="clearLocation">不显示位置</button>
        </div>
        <div class="location-search">
          <input
            v-model="locationKeyword"
            type="text"
            placeholder="搜索附近地点"
            @keyup.enter="locateNearby"
          />
          <button
            v-if="locationKeyword"
            type="button"
            class="search-clear-btn"
            aria-label="清除搜索"
            @click="locationKeyword = ''"
          >
            <span class="material-symbols-outlined">cancel</span>
          </button>
          <button type="button" :disabled="locating" @click="locateNearby">
            {{ locating ? '定位中...' : '搜索' }}
          </button>
        </div>
        <p class="mention-hint">
          {{ locationResults.length ? `附近 ${locationResults.length} 个位置` : '正在获取附近位置' }}
        </p>
        <div class="mention-list">
          <button
            v-for="(item, index) in locationResults"
            :key="item.uid || index"
            type="button"
            class="mention-item location-item"
            @click="selectLocation(item)"
          >
            <span class="material-symbols-outlined location-pin">location_on</span>
            <span class="location-text">
              <strong>{{ item.title || '所在位置' }}</strong>
              <small>{{ item.address || '暂无详细地址' }}</small>
            </span>
            <span
              v-if="selectedLocation?.name === item.title"
              class="material-symbols-outlined mention-check on"
            >check_circle</span>
          </button>
          <p v-if="!locationResults.length && !locating" class="mention-empty">
            暂无附近位置，请搜索地点或重新定位
          </p>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.compose-page {
  height: 100dvh;
  max-height: 100dvh;
  background: var(--pulse-page-bg, var(--pulse-bg));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.compose-header {
  position: relative;
  flex-shrink: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  padding: 0 16px;
  padding-top: var(--pulse-header-pad-top);
  box-sizing: content-box;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.icon-btn {
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  color: var(--pulse-text);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 50%;
  transition: background 0.2s;
}

.icon-btn:active {
  background: rgba(52, 53, 57, 0.5);
}

.title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 25px;
  color: var(--pulse-text);
}

.publish-btn {
  padding: 6px 16px;
  border: none;
  border-radius: 999px;
  background: var(--pulse-primary-container);
  color: var(--pulse-on-primary-container);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  opacity: 0.5;
  box-shadow: 0 4px 12px rgba(75, 142, 255, 0.2);
  transition: opacity 0.2s, transform 0.15s;
}

.publish-btn.active {
  opacity: 1;
}

.publish-btn:active {
  transform: scale(0.95);
}

.publish-btn:disabled {
  cursor: not-allowed;
}

.compose-main {
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: 672px;
  margin: 0 auto;
  padding: 16px 16px 48px;
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  box-sizing: border-box;
}

.text-section {
  margin-bottom: 24px;
}

.content-input {
  width: 100%;
  min-height: 160px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--pulse-text);
  font-size: 17px;
  line-height: 24px;
  resize: none;
  outline: none;
}

.content-input::placeholder {
  color: rgba(193, 198, 215, 0.5);
}

.image-section {
  margin-bottom: 32px;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.image-thumb {
  position: relative;
  aspect-ratio: 1;
  border-radius: 12px;
  overflow: hidden;
  background: var(--pulse-surface-highest);
  cursor: pointer;
}

.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.video-badge {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  color: #fff;
  pointer-events: none;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.45));
}

.video-badge .material-symbols-outlined {
  font-size: 36px;
}

.thumb-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
}

.thumb-remove .material-symbols-outlined {
  font-size: 16px;
}

.add-image-btn {
  aspect-ratio: 1;
  border: 2px dashed var(--pulse-outline-variant);
  border-radius: 12px;
  background: var(--pulse-surface-highest);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}

.add-image-btn:active {
  transform: scale(0.95);
}

.add-icon {
  font-size: 32px;
  color: var(--pulse-outline);
}

.add-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--pulse-text-secondary);
}

.hidden-input {
  display: none;
}

.options-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 32px;
}

.option-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: var(--pulse-surface-low);
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.option-item:active {
  background: var(--pulse-surface-high);
}

.option-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.option-icon-wrap {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--pulse-surface-highest);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--pulse-primary);
  flex-shrink: 0;
}

.option-icon-wrap .material-symbols-outlined {
  font-size: 22px;
}

.option-title {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--pulse-text);
}

.option-sub {
  margin: 2px 0 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--pulse-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}

.option-arrow {
  font-size: 22px;
  color: var(--pulse-outline);
  flex-shrink: 0;
}

.tip-card {
  padding: 16px;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(173, 198, 255, 0.05), transparent);
  border: 1px solid rgba(173, 198, 255, 0.1);
}

.tip-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.tip-icon {
  font-size: 20px;
  color: var(--pulse-primary);
}

.tip-title {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--pulse-primary);
}

.tip-text {
  margin: 0;
  font-size: 15px;
  line-height: 20px;
  color: var(--pulse-text-secondary);
}

.mention-sheet {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--pulse-page-bg, var(--pulse-bg));
}

.mention-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.mention-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--pulse-text);
}

.mention-cancel,
.mention-done {
  border: none;
  background: transparent;
  font-size: 15px;
  cursor: pointer;
  padding: 4px 0;
}

.mention-cancel {
  color: var(--pulse-text-secondary);
}

.mention-done {
  color: var(--pulse-primary);
  font-weight: 600;
}

.mention-hint {
  margin: 0;
  padding: 10px 16px 4px;
  font-size: 12px;
  color: var(--pulse-text-secondary);
}

.mention-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 24px;
}

.mention-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 8px;
  border: none;
  background: transparent;
  color: var(--pulse-text);
  cursor: pointer;
  border-radius: 10px;
}

.mention-item:active {
  background: var(--pulse-surface-high);
}

.mention-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.mention-avatar.initials {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--pulse-surface-highest);
  font-size: 15px;
  font-weight: 600;
}

.mention-name {
  flex: 1;
  text-align: left;
  font-size: 15px;
}

.mention-check {
  font-size: 24px;
  color: var(--pulse-outline);
}

.mention-check.on {
  color: var(--pulse-primary);
}

.mention-empty {
  text-align: center;
  padding: 40px 16px;
  color: var(--pulse-text-secondary);
  font-size: 14px;
}

.location-search {
  display: flex;
  gap: 8px;
  padding: 12px 16px 4px;
}

.location-search input {
  min-width: 0;
  flex: 1;
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--pulse-outline-variant);
  border-radius: 10px;
  background: transparent;
  color: var(--pulse-text);
  outline: none;
}

.location-search button {
  padding: 0 14px;
  border: none;
  border-radius: 10px;
  background: var(--pulse-primary-container);
  color: var(--pulse-on-primary-container);
  font-weight: 600;
}

.location-pin {
  color: var(--pulse-primary);
}

.location-text {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
}

.location-text strong,
.location-text small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.location-text small {
  color: var(--pulse-text-secondary);
}
</style>
