<template>
  <div class="settings-screen">
    <div class="center-card">
      <div class="card-title">AI 模型配置</div>
      <div class="card-desc">配置你的 AI 模型，Agent 将使用该能力进行商业活动</div>

      <div class="form-section">
        <div class="form-group">
          <label>AI 服务商</label>
          <select class="form-input" v-model="form.provider">
            <option value="">请选择服务商</option>
            <option v-for="p in providers" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>

        <div class="form-group">
          <label>API Base URL</label>
          <input class="form-input" v-model="form.base_url" placeholder="https://api.openai.com/v1" />
        </div>

        <div class="form-group">
          <label>API Key</label>
          <input class="form-input" :type="showKey ? 'text' : 'password'" v-model="form.api_key" placeholder="sk-..." />
          <button class="toggle-key" @click="showKey = !showKey">{{ showKey ? '隐藏' : '显示' }}</button>
        </div>

        <div class="form-group">
          <label>模型</label>
          <input class="form-input" v-model="form.model" placeholder="gpt-4 / claude-3 / gemini-pro" />
        </div>

        <div class="masked-info" v-if="maskedKey">
          <span class="info-label">当前 Key（已加密）</span>
          <span class="info-value">{{ maskedKey }}</span>
        </div>

        <div class="btn-row">
          <button class="btn-primary" :disabled="!canSave || busy" @click="saveConfig">
            {{ saveBtnText }}
          </button>
          <button class="btn-test" :disabled="testing || saving || !hasConfig || !store.did" @click="testConnection">
            {{ testing ? '重新测试中...' : '重新测试连接' }}
          </button>
        </div>

        <div class="step-hint" v-if="saving">正在保存配置...</div>
        <div class="step-hint" v-else-if="testing">正在测试 AI 连接...</div>
        <div class="step-hint success" v-else-if="connected">AI 连接成功</div>

        <div class="test-result" v-if="testResult">
          <div class="result-header" :class="testResult.success ? 'success' : 'error'">
            {{ testResult.success ? '✅ 连接成功' : '❌ 连接失败' }}
          </div>
          <div class="result-body" v-if="testResult.content">{{ testResult.content }}</div>
          <div class="result-body error" v-if="testResult.error">{{ testResult.error }}</div>
        </div>

          <div class="connect-success" v-if="connected">
            <div class="success-divider"></div>
            <div class="success-text">AI 已连接</div>
            <div class="success-desc">下一步：AI 将为你进行身份画像访谈，生成统一的 IdentityProfile</div>
            <button class="btn-create-agent" @click="$router.push('/profile/interview')">开始身份访谈</button>
          </div>

        <div class="status-bar error" v-if="error">{{ error }}</div>
        <div class="status-bar success" v-if="saved">配置已保存</div>
      </div>

      <button class="btn-back" @click="$router.push('/main')">返回主界面</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useDidStore } from '../stores/did'

const store = useDidStore()

interface AiConfig {
  provider: string
  base_url: string
  api_key: string
  model: string
}

const providers = ref<{ id: string; name: string }[]>([])
const form = ref<AiConfig>({ provider: '', base_url: '', api_key: '', model: '' })
const maskedKey = ref('')
const showKey = ref(false)
const saving = ref(false)
const testing = ref(false)
const saved = ref(false)
const error = ref('')
const testResult = ref<{ success: boolean; content?: string; error?: string } | null>(null)
const hasConfig = ref(false)
// 连接状态：由「保存后自动测试」或后端持久化状态决定，非仅保存即成功
const connected = ref(false)

const canSave = computed(() => form.value.provider && form.value.base_url && form.value.api_key && form.value.model)
const busy = computed(() => saving.value || testing.value)
const saveBtnText = computed(() => {
  if (saving.value) return '正在保存配置...'
  if (testing.value) return '正在测试 AI 连接...'
  return '保存配置'
})

onMounted(async () => {
  // 加载提供商列表
  try {
    const r = await fetch('/api/ai/providers')
    const j = await r.json()
    if (j.success) providers.value = j.data
  } catch {}

  // 加载已有配置 + 连接状态（后端持久化，刷新后可恢复）
  if (store.did) {
    try {
      const r = await fetch(`/api/ai/config/${store.did}`)
      if (r.ok) {
        const j = await r.json()
        if (j.configured && j.data) {
          form.value.provider = j.data.provider
          form.value.base_url = j.data.base_url
          form.value.model = j.data.model
          maskedKey.value = j.data.api_key_masked
          hasConfig.value = true
          connected.value = j.data.connection_status === 'ok'
          testResult.value = connected.value
            ? { success: true, content: '连接状态已保存' }
            : j.data.connection_status === 'error'
              ? { success: false, error: '上次连接测试未通过，请重新测试' }
              : null
        }
      }
    } catch {}
  }
})

async function saveConfig() {
  if (!canSave.value || busy.value) return
  saving.value = true
  testing.value = false
  error.value = ''
  saved.value = false
  testResult.value = null
  connected.value = false
  try {
    // 1. 保存配置
    const r = await fetch('/api/ai/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ did: store.did, ...form.value }),
    })
    const j = await r.json()
    if (!j.success) {
      error.value = j.detail || '保存失败'
      saving.value = false
      return
    }
    saved.value = true
    hasConfig.value = true
    // 如果传了新的 Key，重新获取掩码
    if (form.value.api_key) {
      const r2 = await fetch(`/api/ai/config/${store.did}`)
      const j2 = await r2.json()
      if (j2.success) maskedKey.value = j2.data.api_key_masked
    }
    form.value.api_key = '' // 清空密码框
    saving.value = false

    // 2. 保存成功后自动测试连接
    testing.value = true
    const ok = await runTest()
    testing.value = false

    // 3. 测试成功 → 连接状态 ready，解锁身份访谈；失败 → 停留在本页显示错误
    if (!ok) {
      return
    }
  } catch (e: any) {
    error.value = e.message || '网络错误'
    saving.value = false
    testing.value = false
  }
}

/** 执行连接测试并返回是否成功（同时更新 connected / testResult） */
async function runTest(): Promise<boolean> {
  if (!store.did) return false
  try {
    const r = await fetch('/api/ai/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ did: store.did }),
    })
    const j = await r.json()
    testResult.value = j
    connected.value = !!j.success
    if (!j.success) {
      error.value = j.error || 'AI 连接测试失败'
    }
    return !!j.success
  } catch (e: any) {
    testResult.value = { success: false, error: e.message }
    connected.value = false
    error.value = e.message || '网络错误'
    return false
  }
}

async function testConnection() {
  if (busy.value || !hasConfig.value || !store.did) return
  connected.value = false
  testResult.value = null
  testing.value = true
  await runTest()
  testing.value = false
}
</script>

<style scoped>
.settings-screen {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-primary);
  position: relative; overflow-y: auto;
}
.center-card {
  width: 480px;
  background: var(--bg-card);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 32px 28px;
  display: flex; flex-direction: column; align-items: center;
  margin: 20px;
}
.card-title { font-size: 20px; font-weight: 600; margin-bottom: 4px; }
.card-desc { font-size: 12px; color: var(--color-text-secondary); margin-bottom: 20px; text-align: center; }
.form-section { width: 100%; }
.form-group { margin-bottom: 14px; position: relative; }
.form-group label { display: block; font-size: 12px; color: var(--color-text-secondary); margin-bottom: 4px; }
.form-input { width: 100%; background: rgba(0,0,0,0.3); border: 1px solid var(--color-border); border-radius: 6px; padding: 8px 12px; color: var(--color-text); font-size: 13px; outline: none; }
.form-input:focus { border-color: var(--color-primary); box-shadow: 0 0 8px rgba(0,212,255,0.2); }
select.form-input { cursor: pointer; }
select.form-input option { background: #1a1e2e; }

.toggle-key {
  position: absolute; right: 8px; bottom: 6px;
  background: none; border: none; color: var(--color-text-secondary); font-size: 11px; cursor: pointer;
}
.toggle-key:hover { color: var(--color-primary); }

.masked-info {
  display: flex; gap: 8px; align-items: center;
  padding: 8px 12px; background: rgba(0,212,255,0.06); border-radius: 6px; margin-bottom: 14px;
}
.info-label { font-size: 11px; color: var(--color-text-secondary); white-space: nowrap; }
.info-value { font-family: var(--font-mono); font-size: 12px; color: var(--color-text); }

.btn-row { display: flex; gap: 8px; margin-top: 4px; }
.btn-primary { flex: 1; padding: 10px; background: linear-gradient(135deg, var(--color-primary), #0090b0); color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.3s; }
.btn-primary:hover:not(:disabled) { box-shadow: 0 0 16px rgba(0,212,255,0.4); }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-test { padding: 10px 16px; background: transparent; border: 1px solid var(--color-border); border-radius: 8px; color: var(--color-text); font-size: 13px; cursor: pointer; transition: all 0.2s; }
.btn-test:hover:not(:disabled) { border-color: var(--color-primary); color: var(--color-primary); }
.btn-test:disabled { opacity: 0.4; cursor: not-allowed; }

.test-result { margin-top: 12px; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--color-border); }
.step-hint {
  margin-top: 10px;
  font-size: 12px;
  color: var(--color-text-secondary);
  text-align: center;
  animation: pulseHint 1.2s ease-in-out infinite;
}
.step-hint.success { color: var(--color-success); animation: none; }
@keyframes pulseHint { 50% { opacity: 0.5; } }
.result-header { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
.result-header.success { color: var(--color-success); }
.result-header.error { color: var(--color-danger); }
.result-body { font-size: 13px; line-height: 1.6; color: var(--color-text); white-space: pre-wrap; }
.result-body.error { color: var(--color-danger); }

.btn-back { margin-top: 16px; background: none; border: none; color: var(--color-text-secondary); font-size: 12px; cursor: pointer; }
.btn-back:hover { color: var(--color-primary); }

.connect-success {
  margin-top: 16px;
  display: flex; flex-direction: column; align-items: center;
  gap: 6px;
}
.success-divider {
  width: 100%; height: 1px;
  background: linear-gradient(90deg, transparent, var(--color-success), transparent);
  margin-bottom: 8px;
}
.success-text {
  font-size: 16px; font-weight: 700; color: var(--color-success);
}
.success-desc {
  font-size: 13px; color: var(--color-text-secondary);
}
.btn-create-agent {
  margin-top: 8px; padding: 10px 24px;
  background: linear-gradient(135deg, var(--color-primary), #0090b0);
  color: #fff; border: none; border-radius: 8px;
  font-size: 14px; font-weight: 700; cursor: pointer;
  transition: all 0.3s;
}
.btn-create-agent:hover { box-shadow: 0 0 16px rgba(0,212,255,0.4); }

.status-bar { margin-top: 8px; font-size: 12px; text-align: center; }
.status-bar.error { color: var(--color-danger); }
.status-bar.success { color: var(--color-success); }
</style>
