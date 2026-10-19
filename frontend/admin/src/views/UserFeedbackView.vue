<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from '@/utils/elementFeedback'
import { fetchUserFeedback, updateUserFeedback, type UserFeedback } from '@/api/helpFeedback'
import { resolveFileUrl } from '@/api/files'
import { formatTime } from '@/utils/datetime'

const loading = ref(false)
const saving = ref(false)
const visible = ref(false)
const rows = ref<UserFeedback[]>([])
const total = ref(0)
const current = ref<UserFeedback>()
const query = reactive({ page: 1, size: 20, status: '', keyword: '' })
const edit = reactive({ status: 'pending', reply: '' })
const labels: Record<string, string> = { pending: '待处理', processing: '处理中', replied: '已回复', closed: '已关闭' }
const tagType = (s: string) => s === 'pending' ? 'warning' : s === 'processing' ? 'primary' : s === 'replied' ? 'success' : 'info'
async function load() {
  loading.value = true
  try { const data = await fetchUserFeedback(query); rows.value=data.list; total.value=data.total }
  catch(e){ ElMessage.error(e instanceof Error ? e.message : '加载失败') }
  finally { loading.value=false }
}
function open(row: UserFeedback) {
  current.value = row
  edit.status = row.status
  edit.reply = row.reply || ''
  visible.value = true
}
async function save() {
  if (!current.value) return
  saving.value=true
  try {
    await updateUserFeedback(current.value.id, edit)
    ElMessage.success('处理结果已保存')
    visible.value=false
    await load()
  } catch(e){ ElMessage.error(e instanceof Error ? e.message : '保存失败') }
  finally{ saving.value=false }
}
onMounted(load)
</script>
<template>
  <div class="page">
    <div class="toolbar">
      <el-input v-model="query.keyword" clearable placeholder="搜索用户或反馈内容" style="width:280px" />
      <el-select v-model="query.status" clearable placeholder="全部状态" style="width:140px">
        <el-option v-for="(label,key) in labels" :key="key" :label="label" :value="key" />
      </el-select>
      <el-button type="primary" @click="query.page=1;load()">查询</el-button>
    </div>
    <el-table v-loading="loading" :data="rows" border>
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column label="用户" min-width="170">
        <template #default="{row}">{{ row.nickname || '-' }}<div class="muted">{{ row.phone || row.pulse_id || row.user_id }}</div></template>
      </el-table-column>
      <el-table-column prop="content" label="反馈内容" min-width="300" show-overflow-tooltip />
      <el-table-column label="图片" width="80"><template #default="{row}">{{ row.image_urls?.length || 0 }} 张</template></el-table-column>
      <el-table-column label="状态" width="100"><template #default="{row}"><el-tag :type="tagType(row.status)">{{ labels[row.status] }}</el-tag></template></el-table-column>
      <el-table-column label="提交时间" width="180"><template #default="{row}">{{ formatTime(row.created_at) }}</template></el-table-column>
      <el-table-column label="操作" width="100"><template #default="{row}"><el-button link type="primary" @click="open(row)">查看处理</el-button></template></el-table-column>
    </el-table>
    <el-pagination v-model:current-page="query.page" :page-size="query.size" :total="total" layout="total, prev, pager, next" @current-change="load" />
    <el-dialog v-model="visible" title="用户反馈详情" width="680px">
      <template v-if="current">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="用户">{{ current.nickname || '-' }}</el-descriptions-item>
          <el-descriptions-item label="手机号">{{ current.phone || '-' }}</el-descriptions-item>
          <el-descriptions-item label="提交时间" :span="2">{{ formatTime(current.created_at) }}</el-descriptions-item>
          <el-descriptions-item label="反馈内容" :span="2"><div class="content">{{ current.content || '（仅图片）' }}</div></el-descriptions-item>
        </el-descriptions>
        <div v-if="current.image_urls?.length" class="images">
          <el-image
            v-for="url in current.image_urls"
            :key="url"
            :src="resolveFileUrl(url)"
            :preview-src-list="current.image_urls.map(resolveFileUrl)"
            fit="cover"
            lazy
          />
        </div>
        <el-form label-width="80px" class="form">
          <el-form-item label="状态"><el-select v-model="edit.status"><el-option v-for="(label,key) in labels" :key="key" :label="label" :value="key" /></el-select></el-form-item>
          <el-form-item label="回复"><el-input v-model="edit.reply" type="textarea" :rows="6" maxlength="2000" show-word-limit /></el-form-item>
        </el-form>
      </template>
      <template #footer><el-button @click="visible=false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存处理结果</el-button></template>
    </el-dialog>
  </div>
</template>
<style scoped>
.page{display:flex;flex-direction:column;gap:16px}.toolbar{display:flex;gap:10px}.el-pagination{justify-content:flex-end}.muted{color:#909399;font-size:12px;margin-top:3px}.content{white-space:pre-wrap}.images{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}.images .el-image{width:96px;height:96px;border:1px solid #e4e7ed;border-radius:4px}.form{margin-top:18px}
</style>
