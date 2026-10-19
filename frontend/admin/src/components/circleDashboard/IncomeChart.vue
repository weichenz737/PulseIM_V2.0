<script setup lang="ts">
import { computed } from 'vue'
import type { EChartsOption } from 'echarts'
import type { CircleIncomeItem } from '@/api/circleDashboard'
import EChart from '@/components/dashboard/EChart.vue'

const props = withDefaults(defineProps<{ data: CircleIncomeItem[]; height?: string }>(), { height: '300px' })
const option = computed<EChartsOption>(() => ({
  color: ['#3b82f6', '#f59e0b', '#10b981'],
  tooltip: { trigger: 'axis', valueFormatter: (value) => `¥ ${(Number(value || 0) / 100).toFixed(2)}` },
  legend: { top: 0, right: 0, icon: 'circle', itemWidth: 8, itemHeight: 8 },
  grid: { top: 42, right: 18, bottom: 28, left: 56 },
  xAxis: { type: 'category', data: props.data.map((item) => item.date), axisTick: { show: false }, axisLabel: { color: '#8b95a7' } },
  yAxis: { type: 'value', axisLabel: { color: '#8b95a7', formatter: (value: number) => `¥${(value / 100).toFixed(0)}` }, splitLine: { lineStyle: { color: '#eef1f5' } } },
  series: [
    { name: '支付金额', type: 'bar', barMaxWidth: 18, data: props.data.map((item) => item.payment), itemStyle: { borderRadius: [4, 4, 0, 0] } },
    { name: '平台抽成', type: 'bar', barMaxWidth: 18, data: props.data.map((item) => item.platformFee), itemStyle: { borderRadius: [4, 4, 0, 0] } },
    { name: '圈主收入', type: 'bar', barMaxWidth: 18, data: props.data.map((item) => item.ownerIncome), itemStyle: { borderRadius: [4, 4, 0, 0] } },
  ],
}))
</script>

<template><EChart :option="option" :height="height" /></template>
