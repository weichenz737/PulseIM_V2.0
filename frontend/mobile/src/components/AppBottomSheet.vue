<script setup lang="ts">
import { Popup } from 'vant'

defineOptions({ inheritAttrs: false })
const show = defineModel<boolean>('show', { default: false })
</script>

<template>
  <!-- Keep business height, close guards, events and safe-area ownership intact. -->
  <Popup v-model:show="show" position="bottom" round teleport="body" :duration="0.22" v-bind="$attrs" class="pulse-bottom-sheet">
    <slot />
  </Popup>
</template>
