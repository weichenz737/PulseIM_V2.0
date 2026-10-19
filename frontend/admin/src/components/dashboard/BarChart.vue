<script setup lang="ts">
import { computed } from 'vue'
import type { EChartsOption } from 'echarts'
import EChart from './EChart.vue'

const props = withDefaults(
  defineProps<{
    categories: string[]
    series: Array<{ name: string; data: number[]; color?: string }>
    height?: string
  }>(),
  { height: '300px' },
)

const option = computed<EChartsOption>(() => ({
  color: props.series.map((item) => item.color || '#3b82f6'),
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  legend: { top: 0, right: 0, icon: 'circle', itemWidth: 8, itemHeight: 8 },
  grid: { top: 40, right: 16, bottom: 24, left: 42 },
  xAxis: { type: 'category', data: props.categories, axisTick: { show: false } },
  yAxis: { type: 'value', splitLine: { lineStyle: { color: '#eef1f5' } } },
  series: props.series.map((item) => ({
    name: item.name,
    type: 'bar',
    barMaxWidth: 20,
    data: item.data,
    itemStyle: { borderRadius: [4, 4, 0, 0] },
  })),
}))
</script>

<template><EChart :option="option" :height="height" /></template>
