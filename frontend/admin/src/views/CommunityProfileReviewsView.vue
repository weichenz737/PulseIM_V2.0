<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from '@/utils/elementFeedback'
import { fetchCommunityProfileReviews, reviewCommunityProfile, type CommunityProfileReview } from '@/api/communities'
import AdminAvatar from '@/components/AdminAvatar.vue'

const loading=ref(false),rows=ref<CommunityProfileReview[]>([]),total=ref(0)
const query=reactive({status:'PENDING',keyword:'',page:1,size:20})
const labels:Record<string,string>={PENDING:'待审核',APPROVED:'已通过',REJECTED:'已拒绝'}
async function load(){loading.value=true;try{const data=await fetchCommunityProfileReviews({...query,keyword:query.keyword||undefined});rows.value=data.items||[];total.value=data.total||0}catch(e){ElMessage.error(e instanceof Error?e.message:'加载失败')}finally{loading.value=false}}
async function act(row:CommunityProfileReview,status:'APPROVED'|'REJECTED'){let reason='';if(status==='REJECTED'){try{const result=await ElMessageBox.prompt('请输入拒绝原因','拒绝资料变更',{inputValidator:v=>!!String(v).trim()||'拒绝原因不能为空'});reason=result.value}catch{return}}else{try{await ElMessageBox.confirm('通过后新的圈子名称或头像将立即生效，确定继续吗？','通过资料变更')}catch{return}}try{await reviewCommunityProfile(row.id,status,reason);ElMessage.success(status==='APPROVED'?'已通过':'已拒绝');await load()}catch(e){ElMessage.error(e instanceof Error?e.message:'操作失败')}}
onMounted(load)
</script>

<template>
  <div>
    <el-card class="toolbar"><el-form inline><el-form-item label="关键词"><el-input v-model="query.keyword" clearable placeholder="圈子或申请人" @keyup.enter="query.page=1;load()" /></el-form-item><el-form-item label="状态"><el-select v-model="query.status" clearable><el-option label="待审核" value="PENDING"/><el-option label="已通过" value="APPROVED"/><el-option label="已拒绝" value="REJECTED"/></el-select></el-form-item><el-button type="primary" @click="query.page=1;load()">查询</el-button></el-form></el-card>
    <el-card><template #header><div class="head"><b>圈子资料变更审核</b><span>名称和头像审核通过后才会在用户端生效</span></div></template>
      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column prop="community_id" label="圈子ID" width="90"/><el-table-column prop="applicant_name" label="申请人" width="120"/>
        <el-table-column label="名称变更" min-width="250"><template #default="{row}"><div v-if="row.changed_name" class="change"><span>{{row.current_name}}</span><b>→</b><strong>{{row.proposed_name}}</strong></div><span v-else>未修改</span></template></el-table-column>
        <el-table-column label="头像变更" width="190"><template #default="{row}"><div v-if="row.changed_avatar" class="avatars"><AdminAvatar :url="row.current_avatar" shape="square">旧</AdminAvatar><b>→</b><AdminAvatar :url="row.proposed_avatar" shape="square">新</AdminAvatar></div><span v-else>未修改</span></template></el-table-column>
        <el-table-column label="申请时间" width="180"><template #default="{row}">{{new Date(row.created_at).toLocaleString()}}</template></el-table-column>
        <el-table-column label="状态" width="100"><template #default="{row}"><el-tag :type="row.status==='APPROVED'?'success':row.status==='REJECTED'?'danger':'warning'">{{labels[row.status]||row.status}}</el-tag></template></el-table-column>
        <el-table-column prop="reject_reason" label="拒绝原因" min-width="160" show-overflow-tooltip/>
        <el-table-column label="操作" width="140" fixed="right"><template #default="{row}"><template v-if="row.status==='PENDING'"><el-button link type="success" @click="act(row,'APPROVED')">通过</el-button><el-button link type="danger" @click="act(row,'REJECTED')">拒绝</el-button></template><span v-else>已处理</span></template></el-table-column>
      </el-table><el-pagination v-model:current-page="query.page" v-model:page-size="query.size" :total="total" layout="total,prev,pager,next" @current-change="load"/>
    </el-card>
  </div>
</template>

<style scoped>.toolbar{margin-bottom:16px}.toolbar :deep(.el-form-item){margin-bottom:0}.head{display:flex;align-items:center;justify-content:space-between}.head span{color:#909399;font-size:13px}.change,.avatars{display:flex;align-items:center;gap:10px}.change span{color:#909399;text-decoration:line-through}.change strong{color:#303133}.avatars :deep(.el-avatar){width:44px;height:44px}.el-pagination{margin-top:16px;justify-content:flex-end}</style>
