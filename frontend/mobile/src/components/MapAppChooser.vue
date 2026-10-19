<script setup lang="ts">
const props = defineProps<{
  show: boolean
  location?: {
    latitude: number
    longitude: number
    name: string
    address?: string
  } | null
}>()

const emit = defineEmits<{ 'update:show': [value: boolean] }>()
const actions = [
  { name: '高德地图', icon: 'location-o' },
  { name: '腾讯地图', icon: 'location-o' },
  { name: '百度地图', icon: 'location-o' },
]

function bd09ToGcj02(latitude: number, longitude: number) {
  const x = longitude - 0.0065
  const y = latitude - 0.006
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * Math.PI)
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * Math.PI)
  return {
    latitude: z * Math.sin(theta),
    longitude: z * Math.cos(theta),
  }
}

function openMapAppWithFallback(appUrl: string, webUrl: string) {
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent)
  if (ios) {
    window.location.href = webUrl
    return
  }
  if (!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    window.open(webUrl, '_blank', 'noopener')
    return
  }

  let appOpened = false
  const markOpened = () => {
    if (document.hidden) appOpened = true
  }
  document.addEventListener('visibilitychange', markOpened)
  window.location.href = appUrl
  window.setTimeout(() => {
    document.removeEventListener('visibilitychange', markOpened)
    if (!appOpened && !document.hidden) window.location.href = webUrl
  }, 1300)
}

function onSelect(action: { name: string }) {
  emit('update:show', false)
  const location = props.location
  if (!location) return
  const name = location.name || '动态位置'
  const address = location.address || name

  if (action.name === '百度地图') {
    const lat = location.latitude.toFixed(6)
    const lon = location.longitude.toFixed(6)
    const source = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'ios.PulseIM' : 'andr.PulseIM'
    const appQuery = new URLSearchParams({ location: `${lat},${lon}`, title: name, content: address, src: source })
    const webQuery = new URLSearchParams({ location: `${lat},${lon}`, title: name, content: address, output: 'html', src: 'webapp.PulseIM' })
    openMapAppWithFallback(
      `baidumap://map/marker?${appQuery.toString()}`,
      `https://api.map.baidu.com/marker?${webQuery.toString()}`,
    )
    return
  }

  const point = bd09ToGcj02(location.latitude, location.longitude)
  const lat = point.latitude.toFixed(6)
  const lon = point.longitude.toFixed(6)
  if (action.name === '高德地图') {
    const appQuery = new URLSearchParams({ sourceApplication: 'PulseIM', poiname: name, lat, lon, dev: '0' })
    const webQuery = new URLSearchParams({ position: `${lon},${lat}`, name, src: 'PulseIM', coordinate: 'gaode', callnative: '0' })
    const scheme = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'iosamap://viewMap' : 'androidamap://viewMap'
    openMapAppWithFallback(
      `${scheme}?${appQuery.toString()}`,
      `https://uri.amap.com/marker?${webQuery.toString()}`,
    )
    return
  }

  const marker = `coord:${lat},${lon};title:${name};addr:${address}`
  const query = new URLSearchParams({ marker, referer: 'PulseIM' })
  openMapAppWithFallback(
    `qqmap://map/marker?${query.toString()}`,
    `https://apis.map.qq.com/uri/v1/marker?${query.toString()}`,
  )
}
</script>

<template>
  <van-action-sheet
    :show="show"
    title="选择地图查看"
    description="将在所选地图中标记该动态的位置"
    :actions="actions"
    cancel-text="取消"
    close-on-click-action
    @update:show="emit('update:show', $event)"
    @select="onSelect"
  />
</template>

