<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from '@/utils/elementFeedback'
import { fetchCommunityConfig, saveCommunityConfig } from '@/api/communities'
const loading = ref(false), saving = ref(false), rate = ref(20)
async function load(){loading.value=true;try{rate.value=Number((await fetchCommunityConfig()).platform_rate)}catch(e){ElMessage.error(e instanceof Error?e.message:'加载失败')}finally{loading.value=false}}
async function save(){saving.value=true;try{await saveCommunityConfig(rate.value);ElMessage.success('收益配置已保存')}catch(e){ElMessage.error(e instanceof Error?e.message:'保存失败')}finally{saving.value=false}}
onMounted(load)
</script>
<template><el-card v-loading="loading" class="revenue-card"><template #header><b>圈子收益配置</b></template><div class="rate-row"><span>平台分成比例</span><el-input-number v-model="rate" :min="0" :max="100" :precision="2" /><span>%</span><el-button type="primary" :loading="saving" @click="save">保存</el-button></div><el-alert title="付费圈子订单完成后，平台按此比例分成，其余金额进入圈主钱包。" type="info" :closable="false" /></el-card></template>
<style scoped>.revenue-card{max-width:720px}.rate-row{display:flex;align-items:center;gap:12px;margin-bottom:22px}.rate-row>span:first-child{width:130px}</style>
