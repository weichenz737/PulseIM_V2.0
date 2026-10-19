<script setup lang="ts">
import LineChart from './LineChart.vue'

defineProps<{
  categories: string[]
  series: Array<{ name: string; data: number[]; color?: string }>
  height?: string
}>()
</script>

<template>
  <LineChart :categories="categories" :series="series" :height="height" area />
</template>
