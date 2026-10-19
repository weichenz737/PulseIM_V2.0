<script setup lang="ts">
import { computed } from 'vue'
import type { EChartsOption } from 'echarts'
import EChart from '@/components/dashboard/EChart.vue'

const props = withDefaults(
  defineProps<{
    data: Array<{ name: string; value: number }>
    doughnut?: boolean
    height?: string
  }>(),
  { doughnut: false, height: '300px' },
)

const option = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'item' },
  legend: { bottom: 0, left: 'center', icon: 'circle', itemWidth: 8, itemHeight: 8 },
  series: [{
    type: 'pie',
    radius: props.doughnut ? ['48%', '72%'] : ['0%', '68%'],
    center: ['50%', '44%'],
    avoidLabelOverlap: true,
    label: { formatter: '{b}\n{d}%', color: '#606266' },
    itemStyle: { borderColor: '#fff', borderWidth: 3 },
    data: props.data,
  }],
}))
</script>

<template><EChart :option="option" :height="height" /></template>
