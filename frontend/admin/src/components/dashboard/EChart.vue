<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'

const props = withDefaults(
  defineProps<{
    option: EChartsOption
    height?: string
  }>(),
  { height: '300px' },
)

const chartRef = ref<HTMLElement>()
let chart: echarts.ECharts | undefined
let resizeObserver: ResizeObserver | undefined

function render() {
  if (!chartRef.value) return
  if (!chart) chart = echarts.init(chartRef.value)
  chart.setOption(props.option, { notMerge: true, lazyUpdate: true })
}

function resize() {
  chart?.resize()
}

onMounted(async () => {
  await nextTick()
  render()
  if (chartRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(chartRef.value)
  } else {
    window.addEventListener('resize', resize)
  }
})

watch(() => props.option, render, { deep: true })

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('resize', resize)
  chart?.dispose()
  chart = undefined
})
</script>

<template>
  <div ref="chartRef" class="echart" :style="{ height }" />
</template>

<style scoped>
.echart {
  width: 100%;
  min-height: 220px;
}
</style>
