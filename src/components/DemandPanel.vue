<template>
  <div class="demand-panel">
    <div class="panel-header">
      <span class="panel-icon">🔍</span>
      <span class="panel-title">AI 需求助手</span>
    </div>

    <div class="input-area">
      <textarea
        v-model="userInput"
        class="demand-input"
        placeholder="描述你的需求，例如：&#10;我要查我老公是否结婚&#10;寻找稳定草莓供应商"
        rows="3"
        :disabled="analyzing"
      ></textarea>
      <button class="btn-analyze" :disabled="!userInput.trim() || analyzing" @click="handleAnalyze">
        {{ analyzing ? '分析中...' : '分析需求' }}
      </button>
    </div>

    <div v-if="analyzing" class="status-bar">AI 正在分析需求...</div>

    <div v-if="error" class="status-bar error">{{ error }}</div>

    <!-- 分析结果 -->
    <div v-if="demandResult" class="result-section">
      <div class="result-divider"></div>
      <div class="result-title">需求分析结果</div>
      <div class="result-grid">
        <div class="result-item">
          <span class="r-label">类别</span>
          <span class="r-value">{{ demandResult.category || '—' }}</span>
        </div>
        <div class="result-item">
          <span class="r-label">意图</span>
          <span class="r-value">{{ demandResult.intent || '—' }}</span>
        </div>
        <div class="result-item" v-if="demandResult.keywords?.length">
          <span class="r-label">关键词</span>
          <span class="r-tags">
            <span class="kw-tag" v-for="k in demandResult.keywords" :key="k">{{ k }}</span>
          </span>
        </div>
        <div class="result-item" v-if="demandResult.budget?.max">
          <span class="r-label">预算</span>
          <span class="r-value">¥{{ demandResult.budget.min }}-{{ demandResult.budget.max }}</span>
        </div>
        <div class="result-item" v-if="demandResult.location?.city">
          <span class="r-label">区域</span>
          <span class="r-value">{{ [demandResult.location.province, demandResult.location.city].filter(Boolean).join(' ') }}</span>
        </div>
      </div>

      <button class="btn-match" :disabled="matching" @click="handleMatch">
        {{ matching ? '搜索中...' : '搜索匹配服务商' }}
      </button>
    </div>

    <!-- 匹配结果 -->
    <div v-if="matchResults !== null" class="match-section">
      <div class="result-divider"></div>
      <div class="result-title" v-if="matchResults.length">
        找到 {{ matchResults.length }} 个匹配服务商
      </div>
      <div class="result-title" v-else>
        未找到匹配的服务商
      </div>

      <div v-for="m in matchResults" :key="m.did" class="match-card">
        <div class="match-header">
          <span class="mc-name">{{ m.services?.[0] || m.category || '服务商' }}</span>
          <span class="mc-score">{{ m.score }}%</span>
        </div>
        <div class="match-detail">
          <span class="mc-cat">{{ m.category }}</span>
          <span class="mc-price" v-if="m.pricing?.max">
            ¥{{ m.pricing.min }}-{{ m.pricing.max }}{{ m.pricing.unit }}
          </span>
        </div>
        <div class="match-tags" v-if="m.matched_services?.length">
          <span class="svc-tag" v-for="s in m.matched_services" :key="s">{{ s }}</span>
        </div>
        <div class="match-reason" v-if="m.reason">{{ m.reason }}</div>
        <div class="match-reason" v-if="m.reason">{{ m.reason }}</div>
        <button class="btn-contact" :disabled="startingConv === m.did" @click="startConversation(m)">
          {{ startingConv === m.did ? '建立中...' : '联系商家' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useDidStore } from '../stores/did'
import { useChat } from '../composables/useChat'

const store = useDidStore()
const chat = useChat()

const userInput = ref('')
const analyzing = ref(false)
const matching = ref(false)
const startingConv = ref('')
const error = ref('')
const demandResult = ref<any>(null)
const matchResults = ref<any[] | null>(null)

async function handleAnalyze() {
  if (!userInput.value.trim() || !store.did) return
  analyzing.value = true
  error.value = ''
  demandResult.value = null
  matchResults.value = null

  try {
    const r = await fetch('/api/demand/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ did: store.did, text: userInput.value.trim() }),
    })
    const j = await r.json()
    if (j.success && j.data) {
      demandResult.value = j.data
    } else {
      error.value = j.error || '分析失败'
    }
  } catch (e: any) {
    error.value = e.message || '网络错误'
  } finally {
    analyzing.value = false
  }
}

async function handleMatch() {
  if (!demandResult.value) return
  matching.value = true
  error.value = ''

  try {
    const r = await fetch('/api/demand/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demand: demandResult.value }),
    })
    const j = await r.json()
    if (j.success) {
      matchResults.value = j.data || []
    } else {
      error.value = '匹配失败'
    }
  } catch (e: any) {
    error.value = e.message || '网络错误'
  } finally {
    matching.value = false
  }
}

async function startConversation(provider: any) {
  if (!store.did || !demandResult.value) return
  startingConv.value = provider.did
  error.value = ''

  try {
    const r = await fetch('/api/conversations/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        consumer_did: store.did,
        provider_did: provider.did,
        demand_text: demandResult.value.original_text || userInput.value,
      }),
    })
    const j = await r.json()
    if (j.success && j.data) {
      await chat.fetchConversations(store.did)
      chat.openChat(j.data.conversation_id)
    } else {
      error.value = j.detail || '建立会话失败'
    }
  } catch (e: any) {
    error.value = e.message || '网络错误'
  } finally {
    startingConv.value = ''
  }
}
</script>

<style scoped>
.demand-panel {
  background: var(--bg-card);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 14px;
}
.panel-header {
  display: flex; align-items: center; gap: 6px;
  margin-bottom: 10px;
}
.panel-icon { font-size: 16px; }
.panel-title { font-size: 14px; font-weight: 700; color: var(--color-primary); }

.input-area { display: flex; flex-direction: column; gap: 8px; }
.demand-input {
  width: 100%;
  background: rgba(0,0,0,0.3);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 10px;
  color: var(--color-text);
  font-size: 13px;
  outline: none;
  resize: vertical;
  font-family: inherit;
  line-height: 1.5;
}
.demand-input:focus { border-color: var(--color-primary); }
.demand-input:disabled { opacity: 0.5; }

.btn-analyze, .btn-match {
  width: 100%; padding: 10px;
  background: linear-gradient(135deg, var(--color-primary), #0090b0);
  color: #fff; border: none; border-radius: 8px;
  font-size: 13px; font-weight: 600; cursor: pointer;
  transition: all 0.3s;
}
.btn-analyze:hover:not(:disabled), .btn-match:hover:not(:disabled) {
  box-shadow: 0 0 12px rgba(0,212,255,0.3);
}
.btn-analyze:disabled, .btn-match:disabled { opacity: 0.4; cursor: not-allowed; }

.status-bar { font-size: 12px; color: var(--color-text-secondary); text-align: center; padding: 8px 0; }
.status-bar.error { color: var(--color-danger); }

.result-section, .match-section { margin-top: 8px; }
.result-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--color-primary), transparent);
  margin: 10px 0;
}
.result-title { font-size: 13px; font-weight: 700; color: var(--color-success); margin-bottom: 8px; }
.result-grid { display: flex; flex-direction: column; gap: 6px; font-size: 12px; margin-bottom: 10px; }
.result-item { display: flex; gap: 6px; align-items: flex-start; }
.r-label { color: var(--color-text-secondary); white-space: nowrap; min-width: 40px; }
.r-value { color: var(--color-text); }
.r-tags { display: flex; flex-wrap: wrap; gap: 3px; }
.kw-tag {
  padding: 1px 6px; border-radius: 4px; font-size: 10px;
  background: rgba(0,212,255,0.1); color: var(--color-primary);
}

.match-card {
  background: rgba(0,212,255,0.04);
  border: 1px solid rgba(0,212,255,0.12);
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.match-card:hover {
  background: rgba(0,212,255,0.08);
  border-color: var(--color-primary);
}
.match-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 4px;
}
.mc-name { font-size: 13px; font-weight: 700; color: var(--color-text); }
.mc-score { font-size: 13px; font-weight: 700; color: var(--color-success); }
.match-detail { display: flex; gap: 8px; font-size: 11px; color: var(--color-text-secondary); margin-bottom: 4px; }
.match-tags { display: flex; flex-wrap: wrap; gap: 3px; }
.match-reason { font-size: 10px; color: var(--color-text-secondary); margin-top: 4px; line-height: 1.5; }
.svc-tag {
  padding: 1px 5px; border-radius: 3px; font-size: 10px;
  background: rgba(0,212,255,0.08); color: var(--color-primary);
}
.btn-contact {
  width: 100%; margin-top: 8px; padding: 6px;
  background: linear-gradient(135deg, var(--color-primary), #0090b0);
  color: #fff; border: none; border-radius: 6px;
  font-size: 12px; font-weight: 600; cursor: pointer;
  transition: all 0.3s;
}
.btn-contact:hover:not(:disabled) { box-shadow: 0 0 10px rgba(0,212,255,0.3); }
.btn-contact:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
