<script setup lang="ts">
defineProps<{
  percent: number
}>()
</script>

<template>
  <div class="progress-wrap">
    <div class="progress-track">
      <div class="progress-fill" :style="{ width: `${percent}%` }" />
    </div>
  </div>
</template>

<style scoped>
.progress-wrap {
  width: 100%;
}

.progress-track {
  height: 4px;
  background: var(--pulse-surface-highest);
  border-radius: 999px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--pulse-primary-container);
  border-radius: 999px;
  transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
</style>
