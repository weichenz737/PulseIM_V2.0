<script setup lang="ts">
import { onMounted } from 'vue'

onMounted(() => {
  // The first desktop milestone keeps the finished visual prototype intact.
  // It will be componentized into Vue views as the real API is connected.
  void import('../app.js')
})
</script>

<template>
  <!--
    Keep the legacy desktop renderer inside stable Vue-owned mount points.
    The business layer is being migrated incrementally; these boundaries make
    sure a page refresh cannot destroy an unrelated modal, popup, or call
    media element.
  -->
  <div id="desktop-legacy-root">
    <div id="desktop-page-root">
      <div id="desktop-login-root">
        <div class="desktop-bootstrap-loading" role="status" aria-live="polite">
          <div class="desktop-bootstrap-mark"><span></span><span></span><span></span></div>
          <strong>正在打开 Pulse</strong>
          <span>正在加载桌面空间…</span>
        </div>
      </div>
      <div id="desktop-shell-root" class="desktop-shell">
        <aside id="desktop-sidebar-root" class="sidebar" />
        <main id="desktop-workspace-root" class="workspace">
          <header id="desktop-topbar-root" class="topbar" />
          <div id="desktop-body-root" class="workspace-body" />
        </main>
      </div>
    </div>
    <div id="desktop-modal-root" />
    <div id="desktop-overlay-root" />
    <div id="desktop-toast-root" />
    <div id="desktop-call-root" />
  </div>
</template>
