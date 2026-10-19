<script setup lang="ts">
import type { HotCircleItem, ActiveCircleItem } from '@/api/circleDashboard'

withDefaults(
  defineProps<{
    rows: HotCircleItem[] | ActiveCircleItem[]
    mode: 'hot' | 'active'
    height?: string
  }>(),
  { height: '365px' },
)
</script>

<template>
  <el-table :data="rows" :height="height" stripe>
    <el-table-column type="index" label="#" width="54" />
    <template v-if="mode === 'hot'">
      <el-table-column prop="name" label="圈子名称" min-width="145" show-overflow-tooltip />
      <el-table-column prop="ownerName" label="圈主" min-width="92" show-overflow-tooltip />
      <el-table-column prop="memberCount" label="成员" width="72" align="right" />
      <el-table-column prop="postCount" label="动态" width="72" align="right" />
      <el-table-column prop="activeMemberCount" label="活跃" width="72" align="right" />
      <el-table-column label="收入" width="108" align="right">
        <template #default="{ row }">¥ {{ (Number(row.income || 0) / 100).toFixed(2) }}</template>
      </el-table-column>
    </template>
    <template v-else>
      <el-table-column prop="name" label="圈子名称" min-width="160" show-overflow-tooltip />
      <el-table-column prop="todayMemberCount" label="期间人数" width="92" align="right" />
      <el-table-column prop="todayMessageCount" label="期间消息" width="92" align="right" />
      <el-table-column prop="todayMomentCount" label="期间动态" width="92" align="right" />
      <el-table-column label="活跃指数" width="100" align="right">
        <template #default="{ row }">{{ Number(row.activeScore ?? (Number(row.todayMemberCount || 0) + Number(row.todayMessageCount || 0) + Number(row.todayMomentCount || 0) * 2)) }}</template>
      </el-table-column>
    </template>
    <template #empty><el-empty description="暂无数据" :image-size="70" /></template>
  </el-table>
</template>

<style scoped>
:deep(.el-table__header th) { color: #7c8799; font-weight: 600; background: #fafbfc; }
:deep(.el-table) { --el-table-border-color: #f0f2f5; }
</style>
