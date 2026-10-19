<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { fetchHelpQuestion, type HelpQuestion } from '@/api/help'
import { smartBack } from '@/utils/navBack'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const question = ref<HelpQuestion | null>(null)
const questionId = computed(() => String(route.params.id || ''))

onMounted(load)

async function load() {
  if (!questionId.value) return
  loading.value = true
  try {
    question.value = await fetchHelpQuestion(questionId.value)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '问题详情加载失败')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="page">
    <header class="header">
      <button type="button" class="icon-btn" aria-label="返回" @click="smartBack(router)">
        <span class="material-symbols-outlined">arrow_back_ios</span>
      </button>
      <h1>问题详情</h1>
      <span class="header-space" />
    </header>
    <main class="content">
      <div v-if="loading" class="state"><van-loading size="22px">加载中...</van-loading></div>
      <article v-else-if="question" class="article">
        <span v-if="question.category" class="category">{{ question.category }}</span>
        <h2>{{ question.question }}</h2>
        <div class="answer">{{ question.answer || '暂无回答' }}</div>
      </article>
      <div v-else class="state">
        <span>未找到该问题</span>
        <button type="button" @click="load">重新加载</button>
      </div>
    </main>
  </div>
</template>

<style scoped>
.page { min-height: 100%; background: var(--pulse-page-bg, var(--pulse-bg)); color: var(--pulse-text); }
.header { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; height: 56px; padding: var(--pulse-header-pad-top) 12px 0; background: rgba(18, 19, 23, .94); backdrop-filter: blur(16px); }
.header h1 { flex: 1; margin: 0; color: var(--pulse-primary); text-align: center; font-size: 18px; font-weight: 600; }
.icon-btn, .header-space { width: 40px; height: 40px; }
.icon-btn { display: grid; place-items: center; padding: 0; border: 0; background: transparent; color: var(--pulse-primary); }
.content { padding: 16px; }
.article { padding: 20px 18px; border-radius: 8px; background: var(--pulse-surface-container); }
.category { display: inline-block; padding: 3px 7px; border-radius: 4px; background: rgba(173,198,255,.12); color: var(--pulse-primary); font-size: 12px; }
h2 { margin: 10px 0 18px; color: var(--pulse-text); font-size: 19px; line-height: 1.5; }
.answer { color: var(--pulse-text-secondary); font-size: 15px; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; }
.state { display: flex; min-height: 260px; flex-direction: column; align-items: center; justify-content: center; gap: 14px; color: var(--pulse-text-secondary); }
.state button { height: 36px; padding: 0 18px; border: 1px solid var(--pulse-primary); border-radius: 6px; background: transparent; color: var(--pulse-primary); }
</style>
