<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { smartBack } from '@/utils/navBack'
import {
  fetchMyRingtone,
  setMyRingtone,
  type CallRingtoneItem,
} from '@/api/callRingtone'
import {
  playPreviewRingtone,
  prefetchCallRingtones,
  prefetchRingtoneList,
  stopPreviewRingtone,
  unlockCallRingtoneAudio,
} from '@/utils/callRingtone'

const router = useRouter()
const loading = ref(true)
const saving = ref(false)
const list = ref<CallRingtoneItem[]>([])
const selectedId = ref<number | null>(null)
const effectiveId = ref<number | null>(null)
/** 当前试听中的铃声 id；null 表示全部暂停 */
const playingId = ref<number | null>(null)

const empty = computed(() => !loading.value && list.value.length === 0)

function goBack() {
  stopPreview()
  smartBack(router)
}

function stopPreview() {
  playingId.value = null
  stopPreviewRingtone()
}

function isPlaying(item: CallRingtoneItem) {
  return playingId.value === item.id
}

async function togglePreview(item: CallRingtoneItem) {
  if (!item.url) return
  // 点正在播的 → 暂停
  if (playingId.value === item.id) {
    stopPreview()
    return
  }
  // 切换铃声：先硬停上一首，避免安卓叠播
  stopPreview()
  unlockCallRingtoneAudio()
  const id = item.id
  playingId.value = id
  const ok = await playPreviewRingtone(item.url, () => {
    if (playingId.value === id) playingId.value = null
  })
  // 若用户已点了别的/暂停，忽略过期结果
  if (playingId.value !== id) return
  if (!ok) {
    playingId.value = null
    showToast('无法播放该铃声')
  }
}

async function load() {
  loading.value = true
  try {
    unlockCallRingtoneAudio()
    const data = await fetchMyRingtone(true)
    list.value = data.list || []
    selectedId.value = data.selectedId
    effectiveId.value = data.id
    // 进页即预缓存全部铃声，安卓点击秒播
    void prefetchRingtoneList((data.list || []).map((x) => x.url).filter(Boolean))
  } catch (e) {
    showToast(e instanceof Error ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
}

function isChecked(item: CallRingtoneItem) {
  if (selectedId.value != null) return selectedId.value === item.id
  return effectiveId.value === item.id || !!item.isDefault
}

async function choose(item: CallRingtoneItem) {
  if (saving.value) return
  saving.value = true
  stopPreview()
  try {
    const data = await setMyRingtone(item.id)
    selectedId.value = data.selectedId
    effectiveId.value = data.id
    list.value = data.list || list.value
    void prefetchCallRingtones()
    showToast('已设置来电铃声')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '设置失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
onUnmounted(stopPreview)
</script>

<template>
  <div class="ringtone-page">
    <header class="page-header">
      <button type="button" class="back-btn" @click="goBack">
        <span class="material-symbols-outlined">arrow_back_ios</span>
      </button>
      <h1 class="page-title">来电铃声</h1>
      <span class="spacer" />
    </header>

    <main class="main">
      <p class="tip">一对一通话时，对方会听到你选择的铃声；群通话仅接收方响铃。</p>

      <section v-if="loading" class="empty">加载中…</section>
      <section v-else-if="empty" class="empty">暂无可用铃声，请联系管理员在后台上传</section>

      <section v-else class="menu-card">
        <button
          v-for="item in list"
          :key="item.id"
          type="button"
          class="menu-row"
          :disabled="saving"
          @click="choose(item)"
        >
          <div class="menu-left">
            <button
              type="button"
              class="play-btn"
              :class="{ playing: isPlaying(item) }"
              :aria-label="isPlaying(item) ? '暂停试听' : '试听铃声'"
              @click.stop="togglePreview(item)"
            >
              <span v-if="isPlaying(item)" class="wave" aria-hidden="true">
                <i /><i /><i /><i />
              </span>
              <span v-else class="material-symbols-outlined">pause</span>
            </button>
            <div class="menu-text">
              <div class="menu-title">
                {{ item.name || '未命名铃声' }}
                <em v-if="item.isDefault">默认</em>
              </div>
            </div>
          </div>
          <div class="menu-right">
            <span
              class="material-symbols-outlined check"
              :class="{ on: isChecked(item) }"
            >
              {{ isChecked(item) ? 'check_circle' : 'radio_button_unchecked' }}
            </span>
          </div>
        </button>
      </section>
    </main>
  </div>
</template>

<style scoped>
.ringtone-page {
  min-height: 100%;
  background: var(--pulse-page-bg, var(--pulse-bg));
  color: var(--pulse-text);
}

.page-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  height: 56px;
  padding: 0 12px;
  padding-top: var(--pulse-header-pad-top);
  background: rgba(18, 19, 23, 0.88);
  backdrop-filter: blur(16px);
}

.back-btn {
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  color: var(--pulse-primary);
  display: grid;
  place-items: center;
}

.page-title {
  flex: 1;
  margin: 0;
  text-align: center;
  font-size: 18px;
  font-weight: 600;
}

.spacer {
  width: 40px;
}

.main {
  padding: 12px 16px 28px;
}

.tip {
  margin: 0 0 12px;
  color: var(--pulse-text-secondary, #9aa3af);
  font-size: 13px;
  line-height: 1.5;
}

.empty {
  padding: 48px 16px;
  text-align: center;
  color: #8b93a1;
}

.menu-card {
  overflow: hidden;
  border-radius: 14px;
  background: var(--pulse-surface-container, #1c1e24);
}

.menu-row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: transparent;
  color: inherit;
  text-align: left;
}

.menu-row:last-child {
  border-bottom: 0;
}

.menu-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.play-btn {
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 50%;
  color: #fff;
  background: rgba(69, 137, 239, 0.9);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  transition: background 0.2s ease, transform 0.15s ease;
}

.play-btn.playing {
  background: #34c759;
}

.play-btn .material-symbols-outlined {
  font-size: 22px;
}

.wave {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 2px;
  width: 18px;
  height: 14px;
}

.wave i {
  display: block;
  width: 2.5px;
  height: 100%;
  border-radius: 2px;
  background: #fff;
  animation: waveBar 0.85s ease-in-out infinite;
  transform-origin: center bottom;
}

.wave i:nth-child(1) {
  animation-delay: 0s;
  height: 40%;
}

.wave i:nth-child(2) {
  animation-delay: 0.12s;
  height: 75%;
}

.wave i:nth-child(3) {
  animation-delay: 0.24s;
  height: 100%;
}

.wave i:nth-child(4) {
  animation-delay: 0.08s;
  height: 55%;
}

@keyframes waveBar {
  0%,
  100% {
    transform: scaleY(0.35);
  }
  50% {
    transform: scaleY(1);
  }
}

.menu-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
}

.menu-title em {
  font-style: normal;
  font-size: 12px;
  color: #f0b45a;
}

.check {
  color: #697586;
  font-size: 24px;
}

.check.on {
  color: #4389ef;
}

@media (prefers-reduced-motion: reduce) {
  .wave i {
    animation: none;
    transform: scaleY(0.7);
  }
}
</style>
