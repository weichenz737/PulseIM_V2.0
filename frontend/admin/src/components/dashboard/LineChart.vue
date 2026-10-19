<script setup lang="ts">
import { computed } from 'vue'
import type { EChartsOption } from 'echarts'
import EChart from './EChart.vue'

const props = withDefaults(
  defineProps<{
    categories: string[]
    series: Array<{ name: string; data: number[]; color?: string }>
    height?: string
    area?: boolean
  }>(),
  { height: '300px', area: false },
)

const option = computed<EChartsOption>(() => ({
  color: props.series.map((item) => item.color || '#3b82f6'),
  tooltip: { trigger: 'axis' },
  legend: { top: 0, right: 0, icon: 'circle', itemWidth: 8, itemHeight: 8 },
  grid: { top: 40, right: 16, bottom: 24, left: 42 },
  xAxis: { type: 'category', boundaryGap: false, data: props.categories, axisTick: { show: false } },
  yAxis: { type: 'value', splitLine: { lineStyle: { color: '#eef1f5' } } },
  series: props.series.map((item) => ({
    name: item.name,
    type: 'line',
    smooth: true,
    symbol: 'none',
    data: item.data,
    lineStyle: { width: 2 },
    areaStyle: props.area ? { opacity: 0.12 } : undefined,
  })),
}))
</script>

<template><EChart :option="option" :height="height" /></template>
