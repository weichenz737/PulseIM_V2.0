<script setup lang="ts">
import { computed } from 'vue'
import type { EChartsOption } from 'echarts'
import EChart from '@/components/dashboard/EChart.vue'

const props = withDefaults(
  defineProps<{
    categories: string[]
    series: Array<{ name: string; data: number[]; color?: string }>
    height?: string
    yAxisName?: string
  }>(),
  { height: '300px', yAxisName: '' },
)

const option = computed<EChartsOption>(() => ({
  color: props.series.map((item) => item.color || '#3b82f6'),
  tooltip: { trigger: 'axis' },
  legend: { top: 0, right: 0, icon: 'circle', itemWidth: 8, itemHeight: 8 },
  grid: { top: 42, right: 18, bottom: 28, left: 42 },
  xAxis: { type: 'category', boundaryGap: false, data: props.categories, axisTick: { show: false }, axisLabel: { color: '#8b95a7' } },
  yAxis: { type: 'value', name: props.yAxisName, splitLine: { lineStyle: { color: '#eef1f5' } }, axisLabel: { color: '#8b95a7' } },
  series: props.series.map((item) => ({
    name: item.name,
    type: 'line',
    smooth: true,
    symbol: 'circle',
    symbolSize: 5,
    data: item.data,
    lineStyle: { width: 2 },
    emphasis: { focus: 'series' },
  })),
}))
</script>

<template><EChart :option="option" :height="height" /></template>
