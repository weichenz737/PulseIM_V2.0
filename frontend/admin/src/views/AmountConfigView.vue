<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from '@/utils/elementFeedback'
import { fetchAmountConfig, updateAmountConfig } from '@/api/amountConfig'

const loading = ref(false)
const saving = ref(false)
const form = reactive({
  redPacketMaxAmount: 200,
  transferMaxAmount: 10000,
})

async function load() {
  loading.value = true
  try {
    const data = await fetchAmountConfig()
    form.redPacketMaxAmount = Number(data.redPacketMaxAmount)
    form.transferMaxAmount = Number(data.transferMaxAmount)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载金额配置失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  if (form.redPacketMaxAmount <= 0 || form.transferMaxAmount <= 0) {
    ElMessage.warning('红包和转账上限必须大于 0')
    return
  }
  saving.value = true
  try {
    const data = await updateAmountConfig({
      redPacketMaxAmount: form.redPacketMaxAmount,
      transferMaxAmount: form.transferMaxAmount,
    })
    form.redPacketMaxAmount = Number(data.redPacketMaxAmount)
    form.transferMaxAmount = Number(data.transferMaxAmount)
    ElMessage.success('金额配置已保存，立即生效')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存金额配置失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div v-loading="loading" class="amount-config-page">
    <section class="config-section">
      <div class="section-heading">
        <div>
          <h3>红包与转账金额上限</h3>
          <p>控制移动端发红包和转账的单笔金额上限，保存后服务端和客户端立即生效。</p>
        </div>
      </div>

      <el-form label-position="top">
        <el-form-item label="单个红包金额上限（元）">
          <el-input-number
            v-model="form.redPacketMaxAmount"
            :min="0.01"
            :max="1000000"
            :precision="2"
            :step="10"
            controls-position="right"
          />
          <div class="form-tip">默认 200 元，最高可配置 1000000 元；红包个数和余额仍按业务规则校验。</div>
        </el-form-item>
        <el-form-item label="单笔转账金额上限（元）">
          <el-input-number
            v-model="form.transferMaxAmount"
            :min="0.01"
            :max="1000000"
            :precision="2"
            :step="10"
            controls-position="right"
          />
          <div class="form-tip">默认 10000 元，最高可配置 1000000 元。</div>
        </el-form-item>
      </el-form>

      <div class="save-row">
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.amount-config-page {
  max-width: 900px;
}

.form-tip {
  width: 100%;
  margin-top: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.save-row {
  display: flex;
  justify-content: flex-start;
  margin-top: 28px;
}
</style>
