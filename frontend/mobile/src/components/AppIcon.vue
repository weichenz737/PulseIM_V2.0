<script setup lang="ts">
import { computed } from 'vue'
import { iconAliases, iconPaths } from './icons/catalog'

const props = defineProps<{ name: string; size?: number | string }>()
const paths = computed(() => iconPaths[iconAliases[props.name] || props.name])
const iconStyle = computed(() => props.size === undefined ? undefined : { fontSize: `${props.size}px`, width: '1em', height: '1em' })
</script>

<template>
  <svg v-if="paths" class="pulse-icon material-symbols-outlined" :style="iconStyle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" v-html="paths" />
  <span v-else class="material-symbols-outlined" :style="iconStyle" aria-hidden="true">{{ name }}</span>
</template>
