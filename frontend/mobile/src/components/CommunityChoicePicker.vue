<script setup lang="ts">
export interface CommunityChoiceOption {
  value: string
  label: string
  description: string
  icon: string
}

defineProps<{
  show: boolean
  value: string | boolean
  kicker: string
  title: string
  description: string
  options: CommunityChoiceOption[] | readonly CommunityChoiceOption[]
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  select: [value: string]
}>()

function select(value: string) {
  emit('select', value)
  emit('update:show', false)
}
</script>

<template>
  <van-popup :show="show" position="bottom" round closeable teleport="body" class="choice-picker-popup" @update:show="emit('update:show', $event)">
    <section class="choice-picker">
      <div class="choice-picker-head">
        <span class="choice-kicker">{{ kicker }}</span>
        <h2>{{ title }}</h2>
        <p>{{ description }}</p>
      </div>
      <div class="choice-options">
        <button
          v-for="option in options"
          :key="option.value"
          type="button"
          class="choice-option"
          :class="{ selected: String(value) === option.value }"
          @click="select(option.value)"
        >
          <span class="choice-icon"><span class="material-symbols-outlined">{{ option.icon }}</span></span>
          <span class="choice-copy"><strong>{{ option.label }}</strong><small>{{ option.description }}</small></span>
          <span class="choice-radio"><span v-if="String(value) === option.value" class="material-symbols-outlined">check</span></span>
        </button>
      </div>
    </section>
  </van-popup>
</template>

<style scoped>
:global(.choice-picker-popup){overflow:hidden;background:var(--pulse-surface-container);color:var(--pulse-text)}
.choice-picker{position:relative;padding:26px 16px calc(20px + env(safe-area-inset-bottom,0px));background:radial-gradient(circle at 8% 0,color-mix(in srgb,var(--pulse-primary) 13%,transparent),transparent 38%)}
.choice-picker::before{content:"";position:absolute;top:8px;left:50%;width:36px;height:4px;border-radius:999px;background:var(--pulse-outline-variant);transform:translateX(-50%)}
.choice-picker-head{padding:4px 38px 18px 2px}.choice-kicker{display:inline-flex;margin-bottom:8px;padding:4px 8px;border-radius:999px;background:color-mix(in srgb,var(--pulse-primary) 12%,transparent);color:var(--pulse-primary);font-size:10px;font-weight:700;letter-spacing:.08em}.choice-picker-head h2{margin:0;color:var(--pulse-text);font-size:21px;font-weight:720}.choice-picker-head p{margin:7px 0 0;color:var(--pulse-text-secondary);font-size:12px;line-height:1.55}
.choice-options{display:grid;gap:10px}.choice-option{display:flex;width:100%;min-height:72px;align-items:center;gap:12px;padding:12px;border:1px solid var(--pulse-outline-variant);border-radius:17px;background:color-mix(in srgb,var(--pulse-surface-high) 88%,transparent);color:var(--pulse-text);font:inherit;text-align:left;transition:border-color .18s ease,background .18s ease,transform .18s ease}.choice-option:active{transform:scale(.985)}.choice-option.selected{border-color:color-mix(in srgb,var(--pulse-primary) 74%,var(--pulse-outline-variant));background:color-mix(in srgb,var(--pulse-primary) 11%,var(--pulse-surface-high));box-shadow:0 8px 24px color-mix(in srgb,var(--pulse-primary) 10%,transparent)}
.choice-icon{display:grid;width:44px;height:44px;flex:0 0 44px;place-items:center;border-radius:14px;background:color-mix(in srgb,var(--pulse-primary) 12%,var(--pulse-surface-container));color:var(--pulse-primary)}.choice-option.selected .choice-icon{background:var(--pulse-primary-gradient);color:var(--pulse-on-primary)}.choice-icon .material-symbols-outlined{font-size:23px}.choice-copy{display:flex;min-width:0;flex:1;flex-direction:column;gap:5px}.choice-copy strong{color:var(--pulse-text);font-size:15px;font-weight:680}.choice-copy small{color:var(--pulse-text-secondary);font-size:12px;line-height:1.4}.choice-radio{display:grid;width:22px;height:22px;flex:0 0 22px;place-items:center;border:1.5px solid var(--pulse-outline-variant);border-radius:50%;color:var(--pulse-on-primary)}.choice-option.selected .choice-radio{border-color:var(--pulse-primary);background:var(--pulse-primary)}.choice-radio .material-symbols-outlined{font-size:15px;font-weight:700}
</style>
