<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { getMapConfig } from '@/api/map'
import { loadBaiduMap } from '@/utils/baiduMap'
import type { LocationPayload } from '@/api/message'

const route = useRoute()
const router = useRouter()
const mapEl = ref<HTMLElement | null>(null)
const loading = ref(true)
const fatalError = ref('')
const locating = ref(false)
const keyword = ref('')
const searching = ref(false)
const results = ref<any[]>([])
const nearbyPlaces = ref<any[]>([])
const selected = ref<LocationPayload | null>(null)
const searchActive = ref(false)
const sheetExpanded = ref(false)
const sheetOffset = ref(0)
const sheetDragging = ref(false)
const sheetDragMoved = ref(false)
const searchInput = ref<HTMLInputElement | null>(null)
let BMap: any
let map: any
let marker: any
let geocoder: any
let localSearch: any
let searchTimer: ReturnType<typeof setTimeout> | undefined
let searchSequence = 0
let composing = false
let sheetDragStartY = 0
let sheetDragStartOffset = 0

const canSend = computed(() => !!selected.value)
const hasSearchQuery = computed(() => keyword.value.trim().length > 0)
const searchMode = computed(() => searchActive.value || searching.value)
const sheetHandleIcon = computed(() => 'expand_more')

function normalizeSearchText(value: unknown) {
  return String(value || '').replace(/\s+/g, '').toLocaleLowerCase()
}

function setPoint(point: any, zoom = 17) {
  if (!map || !BMap) return
  if (marker) map.removeOverlay(marker)
  marker = new BMap.Marker(point)
  map.addOverlay(marker)
  map.centerAndZoom(point, zoom)
}

function reverseGeocode(point: any, fallbackName = '选择的位置') {
  setPoint(point)
  geocoder.getLocation(point, (result: any) => {
    const address = String(result?.address || '').trim()
    const component = result?.addressComponents || {}
    const pois = Array.isArray(result?.surroundingPois)
      ? result.surroundingPois.filter((item: any) => item?.point).slice(0, 10)
      : []
    const fallbackPlace = {
      point,
      title: component.street || fallbackName,
      address: address || fallbackName,
    }
    nearbyPlaces.value = pois.length ? pois : [fallbackPlace]
    const poi = nearbyPlaces.value[0]
    const selectedPoint = poi?.point || point
    selected.value = {
      latitude: Number(selectedPoint.lat),
      longitude: Number(selectedPoint.lng),
      name: String(poi?.title || component.street || fallbackName),
      address: String(poi?.address || address || fallbackName),
    }
    setPoint(selectedPoint)
  }, { poiRadius: 1500, numPois: 10 })
}

function locateCurrent() {
  if (!navigator.geolocation) {
    showToast('当前设备不支持定位')
    return
  }
  locating.value = true
  navigator.geolocation.getCurrentPosition(
    (position) => {
      locating.value = false
      const gps = new BMap.Point(position.coords.longitude, position.coords.latitude)
      const converter = new BMap.Convertor()
      converter.translate([gps], 1, 5, (data: any) => {
        const point = data?.status === 0 && data.points?.[0] ? data.points[0] : gps
        reverseGeocode(point, '当前位置')
      })
    },
    () => {
      locating.value = false
      showToast('定位失败，请开启定位权限或在地图上选点')
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
  )
}

function clearSearchTimer() {
  if (!searchTimer) return
  clearTimeout(searchTimer)
  searchTimer = undefined
}

function searchPlaces() {
  const query = keyword.value.trim()
  const sequence = ++searchSequence
  if (!query || !localSearch) {
    searching.value = false
    results.value = []
    return
  }
  searching.value = true
  localSearch.clearResults?.()
  const requestSearch = new BMap.LocalSearch(map)
  localSearch = requestSearch
  requestSearch.setPageCapacity?.(50)
  requestSearch.setSearchCompleteCallback((searchResult: any) => {
    if (sequence !== searchSequence || query !== keyword.value.trim()) return
    searching.value = false
    const items: any[] = []
    const count = Number(searchResult?.getCurrentNumPois?.() || 0)
    const normalizedQuery = normalizeSearchText(query)
    for (let i = 0; i < count; i += 1) {
      const poi = searchResult.getPoi(i)
      if (poi?.point && normalizeSearchText(poi.title).includes(normalizedQuery)) items.push(poi)
    }
    results.value = items
  })
  requestSearch.search(query)
}

function scheduleSearch() {
  if (composing) return
  clearSearchTimer()
  searchSequence += 1
  if (!keyword.value.trim()) {
    searching.value = false
    results.value = []
    localSearch?.clearResults?.()
    return
  }
  results.value = []
  searchTimer = setTimeout(searchPlaces, 350)
}

function handleCompositionStart() {
  composing = true
  clearSearchTimer()
}

function handleCompositionEnd() {
  composing = false
  scheduleSearch()
}

function cancelSearch() {
  clearSearchTimer()
  searchSequence += 1
  keyword.value = ''
  searchActive.value = false
  sheetExpanded.value = false
  sheetOffset.value = 0
  searching.value = false
  results.value = []
  localSearch?.clearResults?.()
  searchInput.value?.blur()
}

function clearSearchKeyword() {
  clearSearchTimer()
  searchSequence += 1
  keyword.value = ''
  searching.value = false
  results.value = []
  localSearch?.clearResults?.()
}

function handleSearchFocus() {
  searchActive.value = true
  sheetExpanded.value = true
  sheetOffset.value = 0
}

function maxSheetOffset() {
  const viewportHeight = typeof window === 'undefined' ? 800 : window.innerHeight
  const collapsedMapHeight = Math.min(620, Math.max(320, viewportHeight * 0.64))
  const expandedMapHeight = Math.min(420, Math.max(190, viewportHeight * 0.42))
  return searchMode.value ? 0 : Math.max(0, collapsedMapHeight - expandedMapHeight)
}

function startSheetDrag(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  if (sheetExpanded.value || searchMode.value) return
  const target = event.target as HTMLElement | null
  const currentTarget = event.currentTarget as HTMLElement | null
  if (
    currentTarget?.classList.contains('location-sheet')
    && target?.closest('.search-row, .sheet-grab-zone, .sheet-handle')
  ) return
  sheetDragging.value = true
  sheetDragMoved.value = false
  sheetDragStartY = event.clientY
  sheetDragStartOffset = sheetOffset.value
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
}

function moveSheetDrag(event: PointerEvent) {
  if (!sheetDragging.value) return
  const nextOffset = sheetDragStartOffset + event.clientY - sheetDragStartY
  if (Math.abs(event.clientY - sheetDragStartY) > 6) sheetDragMoved.value = true
  sheetOffset.value = Math.min(0, Math.max(-maxSheetOffset(), nextOffset))
  if (sheetDragMoved.value) event.preventDefault()
}

function endSheetDrag(event: PointerEvent) {
  if (!sheetDragging.value) return
  sheetDragging.value = false
  const halfway = maxSheetOffset() / 2
  const shouldExpand = maxSheetOffset() > 0 && sheetOffset.value < -halfway
  sheetExpanded.value = shouldExpand
  sheetOffset.value = 0
  ;(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId)
}

function startSheetTouch(event: TouchEvent) {
  if (event.touches.length !== 1) return
  if (sheetExpanded.value || searchMode.value) return
  const target = event.target as HTMLElement | null
  const currentTarget = event.currentTarget as HTMLElement | null
  if (
    currentTarget?.classList.contains('location-sheet')
    && target?.closest('.search-row, .sheet-grab-zone, .sheet-handle')
  ) return
  sheetDragging.value = true
  sheetDragMoved.value = false
  sheetDragStartY = event.touches[0].clientY
  sheetDragStartOffset = sheetOffset.value
}

function moveSheetTouch(event: TouchEvent) {
  if (!sheetDragging.value || !event.touches.length) return
  const clientY = event.touches[0].clientY
  const nextOffset = sheetDragStartOffset + clientY - sheetDragStartY
  if (Math.abs(clientY - sheetDragStartY) > 6) sheetDragMoved.value = true
  sheetOffset.value = Math.min(0, Math.max(-maxSheetOffset(), nextOffset))
  if (sheetDragMoved.value) event.preventDefault()
}

function endSheetTouch() {
  if (!sheetDragging.value) return
  sheetDragging.value = false
  const maxOffset = maxSheetOffset()
  sheetExpanded.value = maxOffset > 0 && sheetOffset.value < -(maxOffset / 2)
  sheetOffset.value = 0
}

function collapseSheet() {
  sheetExpanded.value = false
  sheetOffset.value = 0
  if (searchActive.value) {
    searchActive.value = false
    searchInput.value?.blur()
  }
}

function expandSheet() {
  sheetExpanded.value = true
  sheetOffset.value = 0
}

function keywordParts(value: unknown) {
  const text = String(value || '')
  const query = keyword.value.trim()
  if (!query) return [{ text, match: false }]

  const parts: Array<{ text: string; match: boolean }> = []
  const source = text.toLocaleLowerCase()
  const needle = query.toLocaleLowerCase()
  let cursor = 0
  let matchIndex = source.indexOf(needle, cursor)
  while (matchIndex >= 0) {
    if (matchIndex > cursor) parts.push({ text: text.slice(cursor, matchIndex), match: false })
    parts.push({ text: text.slice(matchIndex, matchIndex + query.length), match: true })
    cursor = matchIndex + query.length
    matchIndex = source.indexOf(needle, cursor)
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false })
  return parts.length ? parts : [{ text, match: false }]
}

function chooseResult(item: any) {
  clearSearchTimer()
  searchSequence += 1
  selected.value = {
    latitude: Number(item.point.lat),
    longitude: Number(item.point.lng),
    name: String(item.title || '选择的位置'),
    address: String(item.address || item.title || ''),
  }
  setPoint(item.point)
  searchActive.value = false
  sheetExpanded.value = true
  sheetOffset.value = 0
  searchInput.value?.blur()
}

function isSelectedPlace(item: any) {
  if (!selected.value || !item?.point) return false
  return Math.abs(Number(item.point.lat) - selected.value.latitude) < 0.000001
    && Math.abs(Number(item.point.lng) - selected.value.longitude) < 0.000001
}

function confirmLocation() {
  if (!selected.value) return
  const conversationId = String(route.params.id)
  sessionStorage.setItem(`pulse_location_${conversationId}`, JSON.stringify(selected.value))
  const returnTo = typeof route.query.returnTo === 'string' ? route.query.returnTo : `/chat/${conversationId}`
  router.replace(returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : `/chat/${conversationId}`)
}

function goBack() {
  router.back()
}

onMounted(async () => {
  try {
    const config = await getMapConfig()
    if (!config.configured || !config.ak) throw new Error('地图AK尚未配置，请联系管理员')
    BMap = await loadBaiduMap(config.ak)
    await nextTick()
    if (!mapEl.value) return
    map = new BMap.Map(mapEl.value, { enableMapClick: false })
    const initial = new BMap.Point(116.404, 39.915)
    map.centerAndZoom(initial, 12)
    map.enableScrollWheelZoom(true)
    geocoder = new BMap.Geocoder()
    localSearch = new BMap.LocalSearch(map)
    map.addEventListener('click', (event: any) => reverseGeocode(event.point))
    loading.value = false
    locateCurrent()
  } catch (error) {
    loading.value = false
    fatalError.value = error instanceof Error ? error.message : '地图初始化失败'
  }
})

onBeforeUnmount(() => {
  clearSearchTimer()
  searchSequence += 1
  map = null
  marker = null
})
</script>

<template>
  <main class="location-page" :class="{ 'is-searching': searchMode, 'is-sheet-expanded': sheetExpanded }">
    <header class="topbar">
      <button type="button" class="page-cancel" aria-label="取消" @click="goBack">取消</button>
      <h1 aria-hidden="true">发送位置</h1>
      <button type="button" class="send-btn" :disabled="!canSend" @click="confirmLocation">发送</button>
    </header>

    <section class="map-wrap">
      <div ref="mapEl" class="map" />
      <div v-if="loading" class="map-state">地图加载中...</div>
      <div v-else-if="fatalError" class="map-state error">
        <span class="material-symbols-outlined">map</span>
        <p>{{ fatalError }}</p>
      </div>
      <button v-if="!fatalError" type="button" class="locate-btn" aria-label="定位到当前位置" @click="locateCurrent">
        <span class="material-symbols-outlined">{{ locating ? 'progress_activity' : 'my_location' }}</span>
      </button>
    </section>

    <section
      class="location-sheet"
      :class="{ 'is-dragging': sheetDragging }"
      :style="{ transform: `translateY(${sheetOffset}px)` }"
      @pointerdown="startSheetDrag"
      @pointermove="moveSheetDrag"
      @pointerup="endSheetDrag"
      @pointercancel="endSheetDrag"
      @touchstart="startSheetTouch"
      @touchmove="moveSheetTouch"
      @touchend="endSheetTouch"
      @touchcancel="endSheetTouch"
    >
      <button
        v-if="!sheetExpanded && !searchMode"
        type="button"
        class="sheet-grab-zone"
        aria-label="展开地点列表"
        @pointerdown="startSheetDrag"
        @pointermove="moveSheetDrag"
        @pointerup="endSheetDrag"
        @pointercancel="endSheetDrag"
        @touchstart="startSheetTouch"
        @touchmove="moveSheetTouch"
        @touchend="endSheetTouch"
        @touchcancel="endSheetTouch"
        @click="expandSheet"
      />
      <button
        v-else
        type="button"
        class="sheet-handle"
        aria-label="收起地点列表"
        @click="collapseSheet"
      >
        <span class="material-symbols-outlined">{{ sheetHandleIcon }}</span>
      </button>

      <div class="search-row">
        <div class="search-box">
          <span class="material-symbols-outlined">{{ searching ? 'progress_activity' : 'search' }}</span>
          <input
            ref="searchInput"
            v-model="keyword"
            type="text"
            placeholder="搜索地点"
            enterkeyhint="search"
            @focus="handleSearchFocus"
            @input="scheduleSearch"
            @compositionstart="handleCompositionStart"
            @compositionend="handleCompositionEnd"
          />
          <button
            v-if="hasSearchQuery"
            type="button"
            class="search-clear-btn"
            aria-label="清除搜索"
            @click="clearSearchKeyword"
          >
            <span class="material-symbols-outlined">cancel</span>
          </button>
        </div>
        <button
          v-if="searchActive || sheetExpanded || hasSearchQuery"
          type="button"
          class="cancel-search"
          @click="cancelSearch"
        >取消</button>
      </div>

      <section v-if="hasSearchQuery" class="results">
        <button
          v-for="(item, index) in results"
          :key="`${item.uid || index}`"
          type="button"
          :class="{ active: isSelectedPlace(item) }"
          @click="chooseResult(item)"
        >
          <span>
            <strong class="result-title">
              <template v-for="part in keywordParts(item.title)" :key="`${part.match}-${part.text}`">
                <span :class="{ match: part.match }">{{ part.text }}</span>
              </template>
            </strong>
            <small>{{ item.address || '暂无详细地址' }}</small>
          </span>
          <span v-if="isSelectedPlace(item)" class="material-symbols-outlined selected-mark">check</span>
        </button>
        <div v-if="searching" class="search-empty">正在搜索…</div>
        <div v-else-if="!results.length" class="search-empty">
          未找到名称包含“{{ keyword.trim() }}”的地点
        </div>
      </section>

      <section v-else class="nearby">
        <button
          v-for="(item, index) in nearbyPlaces"
          :key="`nearby-${item.uid || index}`"
          type="button"
          :class="{ active: isSelectedPlace(item) }"
          @click="chooseResult(item)"
        >
          <span class="nearby-copy">
            <strong>{{ item.title || '选择的位置' }}</strong>
            <small>{{ item.address || selected?.address || '暂无详细地址' }}</small>
          </span>
          <span v-if="isSelectedPlace(item)" class="material-symbols-outlined selected-mark">check</span>
        </button>
        <div v-if="!nearbyPlaces.length" class="selected-placeholder">
          <span class="material-symbols-outlined">location_on</span>
          <div>
            <strong>{{ selected?.name || '点击地图选择位置' }}</strong>
            <p>{{ selected?.address || '也可以搜索地点或发送当前位置' }}</p>
          </div>
        </div>
      </section>
    </section>
  </main>
</template>

<style scoped>
.location-page {
  --location-safe-top: env(safe-area-inset-top, 0px);
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--pulse-list-page-bg, var(--pulse-page-bg));
  color: #17191c;
  display: flex;
  flex-direction: column;
}
.topbar {
  height: calc(56px + var(--location-safe-top));
  min-height: calc(56px + var(--location-safe-top));
  padding: var(--location-safe-top) 14px 0;
  flex: 0 0 calc(56px + var(--location-safe-top));
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 56px;
  align-items: center;
  background: #f5f6f7;
}
.topbar h1 {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 17px;
  font-weight: 600;
}
.icon-btn, .send-btn, .search-row button, .locate-btn { border: 0; background: transparent; }
.icon-btn { width: 44px; height: 44px; display: grid; place-items: center; }
.send-btn {
  height: 34px;
  padding: 0 13px;
  border-radius: 9px;
  background: #07c160;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
}
.send-btn:disabled {
  background: #d9dde1;
  color: #fff;
}
.search-row {
  min-height: 52px;
  margin: 6px 12px;
  flex: 0 0 52px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.search-box {
  min-width: 0;
  height: 42px;
  padding: 0 4px;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;
}
.search-box:focus-within {
  border: none;
  box-shadow: none;
}
.search-box > .material-symbols-outlined {
  width: 22px;
  flex: 0 0 22px;
  color: #747b83;
  font-size: 20px;
  text-align: center;
}
.search-row input {
  min-width: 0;
  height: 100%;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  font-size: 15px;
  color: inherit;
}
.search-row input::-webkit-search-cancel-button { display: none; }
.search-row .cancel-search {
  min-width: 48px;
  height: 44px;
  flex: 0 0 48px;
  padding: 0;
  color: #087f5b;
  font-size: 15px;
}
.map-wrap { position: relative; height: min(54vh, 520px); background: #e5e8eb; }
.map { width: 100%; height: 100%; }
.map-state { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; background: #eef0f2; color: #687078; }
.map-state.error .material-symbols-outlined { font-size: 42px; }
.map-state p { margin: 8px 24px; }
.locate-btn { position: absolute; right: 14px; bottom: 16px; width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; background: #fff; color: #087f5b; box-shadow: 0 2px 10px rgb(0 0 0 / 18%); }
.results {
  position: absolute;
  z-index: 5;
  top: calc(120px + var(--location-safe-top));
  left: 12px;
  right: 12px;
  max-height: min(45vh, calc(100dvh - 132px - var(--location-safe-top)));
  overflow: auto;
  background: #ffffff;
  border: 1px solid #e4e8ec;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgb(23 25 28 / 14%);
}
.results button {
  width: 100%;
  min-height: 60px;
  padding: 10px 14px;
  display: flex;
  gap: 10px;
  align-items: center;
  border: 0;
  border-bottom: 1px solid #edf0f2;
  background: #ffffff;
  color: #17191c;
  text-align: left;
}
.results button:last-child {
  border-bottom: 0;
}
.results button:active {
  background: #f5f7f8;
}
.results span:last-child { min-width: 0; flex: 1; }
.results strong, .results small { display: block; }
.results strong { color: #17191c; }
.results small { margin-top: 4px; color: #8a9097; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.results > .material-symbols-outlined,
.results button > .material-symbols-outlined { color: #e64a3c; flex-shrink: 0; }
.nearby {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  background: #fff;
}
.nearby h2 {
  margin: 0;
  padding: 13px 16px 8px;
  color: #858b92;
  font-size: 13px;
  font-weight: 500;
}
.nearby button {
  width: 100%;
  min-height: 64px;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 0;
  border-bottom: 1px solid #edf0f2;
  background: #fff;
  color: #17191c;
  text-align: left;
}
.nearby button:active { background: #f5f7f8; }
.nearby button > .material-symbols-outlined {
  flex: 0 0 24px;
  color: #9aa0a6;
}
.nearby button.active > .material-symbols-outlined { color: #07c160; }
.nearby button > span:last-child { min-width: 0; flex: 1; }
.nearby strong,
.nearby small { display: block; }
.nearby strong { overflow: hidden; font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }
.nearby small { margin-top: 5px; overflow: hidden; color: #858b92; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.selected-placeholder { min-height: 82px; padding: 16px; display: flex; gap: 12px; }
.selected-placeholder > .material-symbols-outlined { color: #e64a3c; }
.selected-placeholder div { min-width: 0; flex: 1; }
.selected-placeholder strong { display: block; font-size: 16px; }
.selected-placeholder p { margin: 6px 0 0; color: #858b92; font-size: 13px; line-height: 1.45; }

@media (max-width: 360px) {
  .topbar {
    padding-right: 8px;
    padding-left: 8px;
  }

  .search-row {
    margin-right: 8px;
    margin-left: 8px;
    gap: 4px;
  }

  .search-box {
    padding: 0 4px;
    gap: 5px;
    background: transparent;
    border: none;
  }

  .search-row .cancel-search {
    min-width: 44px;
    flex-basis: 44px;
  }

  .results {
    right: 8px;
    left: 8px;
  }
}
/* The location picker uses an immersive map with a bottom search sheet. Keep
   these rules at the end so the shared mobile search/page defaults cannot
   flatten the reference layout. */
.location-page {
  --location-safe-top: var(--pulse-safe-top, env(safe-area-inset-top, 0px));
  --location-safe-bottom: var(--pulse-safe-bottom, env(safe-area-inset-bottom, 0px));
  --location-map-height: clamp(320px, 64vh, 620px);
  width: 100%;
  height: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  overflow: hidden;
  position: fixed;
  inset: 0;
  z-index: 100;
  isolation: isolate;
  background: var(--pulse-page-bg, #121317);
  color: var(--pulse-text, #e3e2e7);
}
.topbar {
  position: absolute;
  z-index: 10;
  top: 0;
  left: 0;
  right: 0;
  height: calc(56px + var(--location-safe-top));
  min-height: calc(56px + var(--location-safe-top));
  padding: var(--location-safe-top) max(16px, var(--pulse-safe-left, 0px)) 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: transparent !important;
  color: #fff;
  pointer-events: none;
}
.topbar > button { pointer-events: auto; }
.topbar h1 { display: none; }
.page-cancel,
.send-btn,
.search-row button,
.sheet-handle,
.locate-btn {
  border: 0;
}
.page-cancel {
  min-width: 44px;
  height: 44px;
  padding: 0;
  background: transparent;
  color: #fff;
  font-size: 17px;
  text-shadow: 0 1px 3px rgb(0 0 0 / 35%);
}
.send-btn {
  min-width: 62px;
  height: 34px;
  padding: 0 15px;
  border-radius: 10px;
  background: #07c160 !important;
  color: #fff !important;
  font-size: 16px;
  font-weight: 600;
  box-shadow: 0 3px 12px rgb(0 0 0 / 18%);
}
.send-btn:disabled {
  background: rgb(255 255 255 / 34%) !important;
  color: rgb(255 255 255 / 72%) !important;
  box-shadow: none;
}
.map-wrap {
  position: absolute;
  z-index: 0;
  inset: 0 0 auto;
  width: 100%;
  flex: none;
  height: var(--location-map-height);
  min-height: var(--location-map-height);
  background: #e5e8eb;
  transition: flex-basis 180ms ease, height 180ms ease;
}
.location-page.is-searching,
.location-page.is-sheet-expanded {
  --location-map-height: clamp(190px, 42vh, 420px);
}
.location-page.is-searching .map-wrap,
.location-page.is-sheet-expanded .map-wrap {
  height: var(--location-map-height);
  min-height: var(--location-map-height);
}
.map-state {
  background: #17191c;
  color: #a6adb8;
}
.locate-btn {
  right: 16px;
  bottom: 16px;
  background: #fff;
  color: #087ed7;
}
.location-sheet {
  position: absolute;
  z-index: 20;
  top: var(--location-map-height);
  right: 0;
  bottom: 0;
  left: 0;
  min-height: 0;
  flex: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--pulse-surface-container, #1e1f23);
  padding-bottom: var(--location-safe-bottom);
  transition: transform 220ms ease, top 180ms ease;
  will-change: transform;
}
.location-sheet.is-dragging { transition: none; }
.location-page:not(.is-sheet-expanded):not(.is-searching) .location-sheet {
  touch-action: none;
}
.sheet-grab-zone {
  flex: 0 0 32px;
  width: 100%;
  height: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  touch-action: none;
  cursor: grab;
}
.sheet-grab-zone::before {
  content: '';
  width: 42px;
  height: 4px;
  border-radius: 999px;
  background: var(--pulse-outline, #8b90a0);
  opacity: 0.7;
}
.sheet-grab-zone:active { cursor: grabbing; }
.sheet-handle {
  flex: 0 0 32px;
  width: 56px;
  margin: 10px auto 2px;
  padding: 0;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: var(--pulse-surface-high, #292a2e);
  color: var(--pulse-text, #e3e2e7);
  touch-action: none;
  cursor: grab;
}
.sheet-handle:active { cursor: grabbing; }
.sheet-handle .material-symbols-outlined { font-size: 28px; }
:global(:root[data-theme='light'] .location-page .sheet-grab-zone::before) {
  background: #8d969f;
}
:global(:root[data-theme='light'] .location-page .sheet-handle) {
  background: #eef4ff;
  color: #17191c;
}
.search-row {
  min-height: 52px;
  margin: 12px 16px 8px;
  flex: 0 0 52px;
  gap: 12px;
}
.search-box {
  height: 44px;
  padding: 0 12px;
  gap: 10px;
  background: var(--pulse-surface-high, #292a2e) !important;
  border: 0;
  border-radius: 13px;
  box-shadow: none;
}
.search-box:focus-within {
  border: 0;
  box-shadow: 0 0 0 2px rgb(7 193 96 / 18%);
}
.search-box > .material-symbols-outlined {
  color: var(--pulse-outline, #8b90a0);
  font-size: 25px;
}
.search-row input {
  color: var(--pulse-text, #e3e2e7) !important;
  font-size: 16px;
  -webkit-text-fill-color: var(--pulse-text, #e3e2e7);
}
.search-row input::placeholder {
  color: var(--pulse-outline, #8b90a0) !important;
  opacity: 1;
  -webkit-text-fill-color: var(--pulse-outline, #8b90a0);
}
.search-row .cancel-search {
  min-width: 48px;
  height: 44px;
  flex: 0 0 48px;
  padding: 0;
  background: transparent;
  color: #526a96;
  font-size: 17px;
}
.results,
.nearby {
  position: static;
  min-height: 0;
  max-height: none;
  flex: 1;
  overflow: auto;
  background: var(--pulse-surface-container, #1e1f23);
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
.results button,
.nearby button {
  width: 100%;
  min-height: 74px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  border-bottom: 1px solid var(--pulse-divider, rgb(255 255 255 / 10%));
  background: var(--pulse-surface-container, #1e1f23);
  color: var(--pulse-text, #e3e2e7);
  text-align: left;
}
.results button:active,
.nearby button:active {
  background: var(--pulse-pressed, rgb(255 255 255 / 5%));
}
.results button > span,
.nearby-copy {
  min-width: 0;
  flex: 1;
}
.results strong,
.results small,
.nearby strong,
.nearby small {
  display: block;
}
.results strong,
.nearby strong {
  overflow: hidden;
  color: var(--pulse-text, #e3e2e7);
  font-size: 17px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.results strong .match { color: #07b86a; }
.results small,
.nearby small {
  margin-top: 5px;
  overflow: hidden;
  color: var(--pulse-text-secondary, #c1c6d7);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.search-empty {
  padding: 28px 16px;
  color: var(--pulse-text-secondary, #c1c6d7);
  font-size: 14px;
  text-align: center;
}
.nearby h2 { display: none; }
.selected-mark {
  flex: 0 0 28px !important;
  color: #07c160 !important;
  font-size: 28px;
  font-weight: 600;
}
.selected-placeholder {
  min-height: 82px;
  padding: 16px;
  display: flex;
  gap: 12px;
}
.selected-placeholder > .material-symbols-outlined { color: #07c160; }
.selected-placeholder div { min-width: 0; flex: 1; }
.selected-placeholder strong { display: block; font-size: 17px; }
.selected-placeholder p {
  margin: 6px 0 0;
  color: var(--pulse-text-secondary, #c1c6d7);
  font-size: 14px;
  line-height: 1.45;
}

:global(:root[data-theme='light'] .location-page) {
  color: #14243a;
  background: #fff;
}
:global(:root[data-theme='light'] .location-page .topbar) {
  background: transparent !important;
}
:global(:root[data-theme='light'] .location-page .location-sheet),
:global(:root[data-theme='light'] .location-page .nearby),
:global(:root[data-theme='light'] .location-page .results),
:global(:root[data-theme='light'] .location-page .results button),
:global(:root[data-theme='light'] .location-page .nearby button) {
  background: #fff;
}
:global(:root[data-theme='light'] .location-page .search-box) {
  background: #eef0f2 !important;
}
:global(:root[data-theme='light'] .location-page .search-row input) {
  color: #14243a !important;
  -webkit-text-fill-color: #14243a;
}
:global(:root[data-theme='light'] .location-page .search-row input::placeholder) {
  color: #9a9fa5 !important;
  -webkit-text-fill-color: #9a9fa5;
}
:global(:root[data-theme='light'] .location-page .results strong),
:global(:root[data-theme='light'] .location-page .nearby strong) {
  color: #17191c;
}
:global(:root[data-theme='light'] .location-page .results small),
:global(:root[data-theme='light'] .location-page .nearby small),
:global(:root[data-theme='light'] .location-page .selected-placeholder p) {
  color: #9a9fa5;
}
:global(:root[data-theme='light'] .location-page .results button),
:global(:root[data-theme='light'] .location-page .nearby button) {
  border-bottom-color: #edf0f2;
}
:global(:root[data-theme='dark'] .location-page .search-row input) {
  color: #f1f3f5 !important;
  -webkit-text-fill-color: #f1f3f5;
}
:global(:root[data-theme='dark'] .location-page .search-row input::placeholder) {
  color: #aeb6c2 !important;
  -webkit-text-fill-color: #aeb6c2;
}

@media (max-width: 360px) {
  .topbar { padding-right: 10px; padding-left: 10px; }
  .search-row { margin-right: 12px; margin-left: 12px; gap: 8px; }
  .search-row .cancel-search { min-width: 44px; flex-basis: 44px; }
}
</style>
