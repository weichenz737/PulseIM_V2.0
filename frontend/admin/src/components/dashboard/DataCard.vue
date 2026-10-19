<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    value: number | string
    helper?: string
    change?: number
    icon?: string
    tone?: 'blue' | 'green' | 'orange' | 'purple' | 'red'
  }>(),
  { tone: 'blue' },
)
</script>

<template>
  <div class="data-card" :class="`tone-${tone}`">
    <div class="card-top">
      <span class="card-label">{{ label }}</span>
      <span v-if="icon" class="card-icon">{{ icon }}</span>
    </div>
    <div class="card-value">{{ value }}</div>
    <div class="card-footer">
      <span v-if="helper" class="card-helper">{{ helper }}</span>
      <span v-if="change !== undefined" class="card-change" :class="change >= 0 ? 'up' : 'down'">
        {{ change >= 0 ? '↑' : '↓' }} {{ Math.abs(change) }}%
      </span>
    </div>
  </div>
</template>

<style scoped>
.data-card {
  min-height: 136px;
  box-sizing: border-box;
  padding: 18px 20px 16px;
  border: 1px solid #edf0f5;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 4px 14px rgba(31, 41, 55, 0.03);
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}
.data-card:hover { transform: translateY(-2px); box-shadow: 0 8px 22px rgba(31, 41, 55, 0.08); }
.card-top, .card-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.card-label, .card-helper { color: #909399; font-size: 13px; }
.card-icon { font-size: 18px; opacity: 0.78; }
.card-value { margin: 13px 0 9px; color: #1f2937; font-size: 28px; line-height: 1; font-weight: 700; letter-spacing: -0.5px; }
.card-change { font-size: 12px; font-weight: 600; }
.card-change.up { color: #16a34a; }
.card-change.down { color: #ef4444; }
.tone-blue .card-icon { color: #3b82f6; }
.tone-green .card-icon { color: #10b981; }
.tone-orange .card-icon { color: #f59e0b; }
.tone-purple .card-icon { color: #8b5cf6; }
.tone-red .card-icon { color: #ef4444; }
</style>
