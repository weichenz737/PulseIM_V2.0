<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from '@/utils/elementFeedback'
import { fetchCommunityAuditLogs, type CommunityAuditLog } from '@/api/communities'
const route=useRoute(),loading=ref(false),rows=ref<CommunityAuditLog[]>([]),total=ref(0),query=reactive({keyword:'',eventType:'',page:1,size:20})
const type=computed(()=>String(route.meta.logType||'MEMBER') as 'DISSOLVE'|'TRANSFER'|'MEMBER')
const title=computed(()=>type.value==='DISSOLVE'?'圈子解散记录':type.value==='TRANSFER'?'圈主转移记录':'圈子成员出入记录')
const eventLabels:Record<string,string>={JOIN:'加入圈子',LEAVE:'主动退出',LEAVE_APPROVED:'审核退出',REMOVED:'被管理员移除',DISSOLVED:'圈子解散退出'}
async function load(){loading.value=true;try{const data=await fetchCommunityAuditLogs(type.value,{...query,keyword:query.keyword||undefined,eventType:query.eventType||undefined});rows.value=data.items||[];total.value=data.total||0}catch(e){ElMessage.error(e instanceof Error?e.message:'加载失败')}finally{loading.value=false}}
watch(type,()=>{query.keyword='';query.eventType='';query.page=1;void load()});onMounted(load)
</script>
<template><el-card class="toolbar"><el-form inline><el-form-item label="关键词"><el-input v-model="query.keyword" clearable placeholder="圈子、成员、操作人或原因" @keyup.enter="query.page=1;load()" /></el-form-item><el-form-item v-if="type==='MEMBER'" label="动作"><el-select v-model="query.eventType" clearable placeholder="全部动作"><el-option label="加入圈子" value="JOIN"/><el-option label="主动退出" value="LEAVE"/><el-option label="审核退出" value="LEAVE_APPROVED"/><el-option label="管理员移除" value="REMOVED"/><el-option label="圈子解散" value="DISSOLVED"/></el-select></el-form-item><el-button type="primary" @click="query.page=1;load()">查询</el-button></el-form></el-card><el-card><template #header><div class="head"><b>{{title}}</b><span>记录包含具体原因、操作人和操作时间</span></div></template><el-table v-loading="loading" :data="rows" stripe>
  <el-table-column prop="community_id" label="圈子ID" width="90"/><el-table-column prop="community_name" label="圈子" min-width="140"/>
  <template v-if="type==='DISSOLVE'"><el-table-column prop="owner_name" label="原圈主" width="130"/><el-table-column prop="member_count" label="解散时成员" width="110"/></template>
  <template v-else-if="type==='TRANSFER'"><el-table-column prop="previous_owner_name" label="原圈主" width="130"/><el-table-column prop="new_owner_name" label="新圈主" width="130"/></template>
  <template v-else><el-table-column prop="member_name" label="成员" width="130"/><el-table-column label="出入类型" width="120"><template #default="{row}">{{eventLabels[row.event_type]||row.event_type}}</template></el-table-column></template>
  <el-table-column prop="reason" label="具体原因" min-width="220" show-overflow-tooltip/><el-table-column prop="operator_name" label="操作人" width="130"/><el-table-column label="操作日期" width="180"><template #default="{row}">{{new Date(row.created_at).toLocaleString()}}</template></el-table-column>
  </el-table><el-pagination v-model:current-page="query.page" v-model:page-size="query.size" :total="total" layout="total,prev,pager,next" @current-change="load"/></el-card></template>
<style scoped>.toolbar{margin-bottom:16px}.toolbar :deep(.el-form-item){margin-bottom:0}.head{display:flex;align-items:center;justify-content:space-between}.head span{color:#909399;font-size:13px}.el-pagination{margin-top:16px;justify-content:flex-end}</style>
