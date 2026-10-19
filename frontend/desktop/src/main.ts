import { createApp } from 'vue'
import App from './App.vue'
import { initializeDesktopServerOrigin } from './desktopApi'
import '../styles.css'

async function startDesktop() {
  await initializeDesktopServerOrigin().catch((error) => {
    console.error('[Pulse Desktop] server discovery failed', error)
  })
  createApp(App).mount('#app')
}

void startDesktop()
