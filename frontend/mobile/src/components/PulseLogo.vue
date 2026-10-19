<template>
  <div class="pulse-logo">
    <svg width="32" height="32" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M6 10c0-2.21 1.79-4 4-4h8c2.21 0 4 1.79 4 4v4c0 2.21-1.79 4-4 4h-5l-3 2.5V18H10c-2.21 0-4-1.79-4-4v-4z"
        fill="currentColor"
        opacity="0.95"
      />
      <circle cx="11.5" cy="13" r="1.1" fill="var(--pulse-on-primary-container)" />
      <circle cx="14" cy="13" r="1.1" fill="var(--pulse-on-primary-container)" />
      <circle cx="16.5" cy="13" r="1.1" fill="var(--pulse-on-primary-container)" />
    </svg>
  </div>
</template>

<style scoped>
.pulse-logo {
  width: 64px;
  height: 64px;
  border-radius: var(--pulse-radius-lg);
  background: var(--pulse-primary-container);
  color: var(--pulse-on-primary-container);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 32px rgba(75, 142, 255, 0.35);
}
</style>
