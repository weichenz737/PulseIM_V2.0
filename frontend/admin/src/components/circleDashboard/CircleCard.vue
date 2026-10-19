<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    value: number | string
    helper: string
    change?: number
    tone?: 'blue' | 'green' | 'orange' | 'purple' | 'red'
    clickable?: boolean
  }>(),
  { tone: 'blue', clickable: false },
)

defineEmits<{ click: [] }>()
</script>

<template>
  <div class="circle-card" :class="[`tone-${tone}`, { clickable }]" @click="$emit('click')">
    <div class="card-heading">
      <span class="card-label">{{ label }}</span>
      <span class="card-dot" />
    </div>
    <div class="card-value">{{ value }}</div>
    <div class="card-footer">
      <span>{{ helper }}</span>
      <span v-if="change !== undefined" class="card-change" :class="change >= 0 ? 'up' : 'down'">
        {{ change >= 0 ? '+' : '' }}{{ change }}%
      </span>
    </div>
  </div>
</template>

<style scoped>
.circle-card { min-height: 132px; padding: 18px 20px 16px; box-sizing: border-box; border: 1px solid #edf0f5; border-radius: 14px; background: #fff; box-shadow: 0 4px 14px rgba(31, 41, 55, .035); transition: transform .16s ease, box-shadow .16s ease; }
.circle-card.clickable { cursor: pointer; }
.circle-card.clickable:hover { transform: translateY(-2px); box-shadow: 0 9px 22px rgba(31, 41, 55, .09); }
.card-heading, .card-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.card-label, .card-footer { color: #8b95a7; font-size: 13px; }
.card-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; opacity: .8; }
.card-value { margin: 14px 0 10px; color: #1f2937; font-size: 28px; line-height: 1; font-weight: 700; letter-spacing: -.5px; }
.card-change { font-size: 12px; font-weight: 600; }
.card-change.up { color: #16a34a; }
.card-change.down { color: #ef4444; }
.tone-blue { color: #3b82f6; }
.tone-green { color: #10b981; }
.tone-orange { color: #f59e0b; }
.tone-purple { color: #8b5cf6; }
.tone-red { color: #ef4444; }
</style>
