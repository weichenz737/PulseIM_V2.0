<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'danger' | 'text'
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  loading?: boolean
}>(), { variant: 'primary', type: 'button', disabled: false, loading: false })
</script>

<template>
  <button :type="type" class="pulse-button" :class="`pulse-button--${variant}`" :disabled="disabled || loading" :aria-busy="loading || undefined">
    <span v-if="loading" class="pulse-button-spinner" aria-hidden="true" />
    <slot />
  </button>
</template>
