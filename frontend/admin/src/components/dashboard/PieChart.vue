<script setup lang="ts">
import { computed } from 'vue'
import type { EChartsOption } from 'echarts'
import EChart from './EChart.vue'

const props = withDefaults(
  defineProps<{
    data: Array<{ name: string; value: number }>
    height?: string
  }>(),
  { height: '300px' },
)

const option = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'item' },
  legend: { bottom: 0, left: 'center', icon: 'circle', itemWidth: 8, itemHeight: 8 },
  series: [{
    type: 'pie',
    radius: ['45%', '70%'],
    center: ['50%', '45%'],
    avoidLabelOverlap: true,
    label: { formatter: '{b}\n{d}%', color: '#606266' },
    itemStyle: { borderColor: '#fff', borderWidth: 3 },
    data: props.data,
  }],
}))
</script>

<template><EChart :option="option" :height="height" /></template>
