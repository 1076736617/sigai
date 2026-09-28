<template>
  <div class="interview-screen">
    <div class="center-card">
      <div class="card-title">AI 身份画像访谈</div>
      <div class="card-desc">你的 AI 正在了解你的身份、能力与需求，生成统一 IdentityProfile</div>

      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: progressPct + '%' }"></div>
      </div>
      <div class="progress-text">第 {{ round }} / 5 轮</div>

      <div class="chat-area" ref="chatRef">
        <div v-for="(m, i) in messages" :key="i"
             class="chat-bubble"
             :class="m.role === 'assistant' ? 'ai' : 'user'">
          <div class="bubble-label">{{ m.role === 'assistant' ? 'AI 访谈官' : '你' }}</div>
          <div class="bubble-text">{{ m.content }}</div>
        </div>

        <div v-if="aiThinking" class="chat-bubble ai">
          <div class="bubble-label">AI 访谈官</div>
          <div class="bubble-text thinking">思考中...</div>
        </div>

        <!-- 统一 IdentityProfile 结果 -->
        <div v-if="profileResult" class="profile-result">
          <div class="profile-divider"></div>
          <div class="profile-title">身份画像生成完成</div>
          <div class="profile-grid">
            <div class="profile-item" v-if="profileResult.identity?.name || profileResult.basic_info?.name">
              <span class="p-label">身份名称</span>
              <span class="p-value">{{ profileResult.identity?.name || profileResult.basic_info?.name }}</span>
            </div>
            <div class="profile-item" v-if="profileResult.business_profile?.industry">
              <span class="p-label">擅长领域</span>
              <span class="p-value">{{ profileResult.business_profile.industry }}</span>
            </div>
            <div class="profile-item" v-if="capabilitiesList.length">
              <span class="p-label">我能提供</span>
              <span class="p-tags">
                <span class="tag" v-for="(c, ci) in capabilitiesList" :key="ci">✓ {{ c }}</span>
              </span>
            </div>
            <div class="profile-item" v-if="profileResult.needs?.length">
              <span class="p-label">我需要</span>
              <span class="p-tags">
                <span class="tag need" v-for="(n, ni) in profileResult.needs" :key="ni">{{ n }}</span>
              </span>
            </div>
            <div class="profile-item" v-if="profileResult.interests?.length">
              <span class="p-label">我的兴趣</span>
              <span class="p-tags">
                <span class="tag" v-for="(t, ti) in profileResult.interests" :key="ti">{{ t }}</span>
              </span>
            </div>
            <div class="profile-item" v-if="profileResult.goals?.length">
              <span class="p-label">我的目标</span>
              <span class="p-tags">
                <span class="tag" v-for="(g, gi) in profileResult.goals" :key="gi">{{ g }}</span>
              </span>
            </div>
            <div class="profile-item" v-if="profileResult.basic_info?.description || profileResult.identity?.description">
              <span class="p-label">身份描述</span>
              <span class="p-value">{{ profileResult.basic_info?.description || profileResult.identity?.description }}</span>
            </div>
            <div class="profile-item" v-if="profileResult.business_profile?.target_customers?.length">
              <span class="p-label">可合作对象</span>
              <span class="p-value">{{ profileResult.business_profile.target_customers.join('、') }}</span>
            </div>
            <div class="profile-item" v-if="profileResult.business_profile?.service_area">
              <span class="p-label">覆盖区域</span>
              <span class="p-value">{{ profileResult.business_profile.service_area }}</span>
            </div>
            <div class="profile-item" v-if="locationText">
              <span class="p-label">所在地</span>
              <span class="p-value">{{ locationText }}</span>
            </div>
          </div>
          <button class="btn-primary" @click="handleSaveAndCreate">
            确认并创建 Agent
          </button>
        </div>
      </div>

      <div class="input-area" v-if="!profileResult && !aiThinking">
        <input class="chat-input" v-model="userInput" placeholder="输入你的回答..." @keydown.enter="sendAnswer" :disabled="!canAnswer" />
        <button class="btn-send" :disabled="!userInput.trim()" @click="sendAnswer">发送</button>
      </div>

      <div class="status-bar error" v-if="error">{{ error }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDidStore } from '../stores/did'

const router = useRouter()
const store = useDidStore()

const messages = ref<{ role: string; content: string }[]>([])
const userInput = ref('')
const aiThinking = ref(false)
const error = ref('')
const profileResult = ref<any>(null)
const profileId = ref('')
const registeredLocation = ref('')
const chatRef = ref<HTMLElement | null>(null)

const round = computed(() => {
  return messages.value.filter(m => m.role === 'user').length + 1
})

const canAnswer = computed(() => !profileResult.value && !aiThinking.value)

const capabilitiesList = computed(() => {
  const caps = profileResult.value?.capabilities || []
  return caps
    .map((c: any) => (typeof c === 'string' ? c : c.service_name || c.name || ''))
    .filter(Boolean)
})

/** 所在地：优先画像内结构化 country/province/city，其次注册时选择的地点，都没有则显示未设置 */
const locationText = computed(() => {
  const loc = profileResult.value?.basic_info?.location || {}
  const parts = [loc.country, loc.province, loc.city].filter(Boolean)
  if (parts.length) {
    return parts.join(' · ')
  }
  return registeredLocation.value || '未设置'
})

const progressPct = computed(() => {
  return Math.min((round.value / 5) * 100, 100)
})

onMounted(async () => {
  if (!store.did) {
    error.value = '请先创建 DID 身份'
    return
  }
  await loadRegisteredLocation()
  await startInterview()
})

async function loadRegisteredLocation() {
  try {
    const r = await fetch(`/api/did/location?did=${encodeURIComponent(store.did)}`)
    if (r.ok) {
      const j = await r.json()
      if (j.has_location && j.data) {
        const parts = [j.data.country, j.data.province, j.data.city].filter(Boolean)
        if (parts.length) {
          registeredLocation.value = parts.join(' · ')
        }
      }
    }
  } catch {}
}

async function startInterview() {
  aiThinking.value = true
  error.value = ''
  try {
    const r = await fetch('/api/profile/interview/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ did: store.did, history: [] }),
    })
    const j = await r.json()
    if (j.success && j.content) {
      messages.value.push({ role: 'assistant', content: j.content })
    } else {
      error.value = j.error || 'AI 访谈启动失败'
    }
  } catch (e: any) {
    error.value = e.message || '网络错误'
  } finally {
    aiThinking.value = false
    scrollToBottom()
  }
}

async function sendAnswer() {
  if (!userInput.value.trim() || !canAnswer.value) return
  const answer = userInput.value.trim()
  userInput.value = ''
  messages.value.push({ role: 'user', content: answer })
  scrollToBottom()

  aiThinking.value = true
  error.value = ''

  try {
    const r = await fetch('/api/profile/interview/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        did: store.did,
        history: messages.value.map(m => ({ role: m.role, content: m.content })),
      }),
    })
    const j = await r.json()
    if (j.success) {
      if (j.done && j.profile) {
        profileResult.value = j.profile
        messages.value.push({
          role: 'assistant',
          content: '我已了解你的身份，以下是你生成的统一身份画像：',
        })
        await saveProfile(j.profile)
      } else if (j.content) {
        messages.value.push({ role: 'assistant', content: j.content })
      }
    } else {
      error.value = j.error || 'AI 回复失败'
    }
  } catch (e: any) {
    error.value = e.message || '网络错误'
  } finally {
    aiThinking.value = false
    scrollToBottom()
  }
}

async function saveProfile(profile: any) {
  const body: Record<string, any> = {
    did: store.did,
    ai_summary: profile.summary || profile.basic_info?.description || profile.identity?.description || '',
    category: profile.category || profile.business_profile?.industry || '',
    services: profile.services || [],
    keywords: profile.keywords || [],
    pricing: profile.pricing || {},
    capacity: profile.capacity || {},
    coverage: profile.coverage || {},
    constraints: profile.constraints || [],
    profile_json: profile,
  }
  try {
    const r = await fetch('/api/profile/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const j = await r.json()
    if (j.success) {
      profileId.value = j.profile_id
    }
  } catch {}
}

async function handleSaveAndCreate() {
  const data = profileResult.value
  if (!data) return
  try {
    const nickname = data.basic_info?.name || data.identity?.name || 'AI Agent'
    const summary = data.basic_info?.description || data.identity?.description || ''

    const r = await fetch('/api/agent/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        did: store.did,
        name: nickname,
        type: store.identityType || 'ai_identity',
        description: summary,
        profile_id: profileId.value || undefined,
      }),
    })
    const j = await r.json()
    if (j.success) {
      // 创建 Agent 成功后，验证身份状态再跳转
      try {
        const statusRes = await fetch(`/api/did/status?did=${encodeURIComponent(store.did)}`)
        const statusData = await statusRes.json()
        console.log('[PROFILE INTERVIEW] status after agent create:', statusData)
        if (statusData.exists && statusData.profileCompleted) {
          router.push('/main')
        } else {
          error.value = '身份画像保存成功，但状态验证未通过，请刷新页面重试'
          console.error('[PROFILE INTERVIEW] status mismatch:', statusData)
        }
      } catch {
        // 状态验证网络失败时仍允许跳转（Agent 已创建成功）
        router.push('/main')
      }
    } else {
      error.value = j.detail || '创建 Agent 失败'
    }
  } catch (e: any) {
    error.value = e.message || '网络错误'
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (chatRef.value) {
      chatRef.value.scrollTop = chatRef.value.scrollHeight
    }
  })
}
</script>

<style scoped>
.interview-screen {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-primary);
  position: relative; overflow-y: auto;
}
.center-card {
  width: 520px;
  background: var(--bg-card);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 28px;
  display: flex; flex-direction: column;
  margin: 20px;
  max-height: 90vh;
}
.card-title { font-size: 20px; font-weight: 600; margin-bottom: 4px; }
.card-desc { font-size: 12px; color: var(--color-text-secondary); margin-bottom: 12px; }

.progress-bar {
  width: 100%; height: 4px;
  background: rgba(255,255,255,0.08);
  border-radius: 2px;
  margin-bottom: 4px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-primary), #0090b0);
  border-radius: 2px;
  transition: width 0.5s ease;
}
.progress-text {
  font-size: 11px; color: var(--color-text-secondary);
  margin-bottom: 12px; text-align: right;
}

.chat-area {
  flex: 1;
  min-height: 200px;
  max-height: 400px;
  overflow-y: auto;
  display: flex; flex-direction: column;
  gap: 10px;
  padding: 12px;
  background: rgba(0,0,0,0.15);
  border-radius: 8px;
  margin-bottom: 12px;
}
.chat-bubble {
  max-width: 85%;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.6;
}
.chat-bubble.ai {
  align-self: flex-start;
  background: rgba(0,212,255,0.08);
  border: 1px solid rgba(0,212,255,0.15);
}
.chat-bubble.user {
  align-self: flex-end;
  background: rgba(0,212,255,0.15);
  border: 1px solid rgba(0,212,255,0.25);
}
.bubble-label {
  font-size: 10px; font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 2px;
}
.bubble-text { color: var(--color-text); }
.thinking { color: var(--color-text-secondary); font-style: italic; }

.profile-result {
  width: 100%;
  margin-top: 8px;
}
.profile-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--color-primary), transparent);
  margin-bottom: 12px;
}
.profile-title {
  font-size: 14px; font-weight: 700; color: var(--color-success);
  text-align: center; margin-bottom: 12px;
}
.profile-grid {
  display: flex; flex-direction: column; gap: 8px;
}
.profile-item {
  display: flex; gap: 8px; align-items: flex-start;
  font-size: 13px;
}
.profile-item.full { flex-direction: column; }
.p-label {
  color: var(--color-text-secondary);
  white-space: nowrap;
  min-width: 48px;
  font-size: 12px;
}
.p-value { color: var(--color-text); }
.p-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.tag {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  background: rgba(0,212,255,0.1);
  color: var(--color-primary);
}
.tag.need {
  background: rgba(255,183,77,0.15);
  color: #ffb74d;
}
.btn-primary {
  width: 100%; margin-top: 14px; padding: 12px;
  background: linear-gradient(135deg, var(--color-primary), #0090b0);
  color: #fff; border: none; border-radius: 8px;
  font-size: 14px; font-weight: 700; cursor: pointer;
  transition: all 0.3s;
}
.btn-primary:hover { box-shadow: 0 0 16px rgba(0,212,255,0.4); }

.input-area {
  display: flex; gap: 8px;
}
.chat-input {
  flex: 1;
  background: rgba(0,0,0,0.3);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 10px 14px;
  color: var(--color-text);
  font-size: 13px;
  outline: none;
}
.chat-input:focus { border-color: var(--color-primary); }
.chat-input:disabled { opacity: 0.5; }

.btn-send {
  padding: 10px 18px;
  background: var(--color-primary);
  border: none; border-radius: 8px;
  color: #fff; font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.2s;
}
.btn-send:hover:not(:disabled) { box-shadow: 0 0 12px rgba(0,212,255,0.3); }
.btn-send:disabled { opacity: 0.4; cursor: not-allowed; }

.status-bar { margin-top: 8px; font-size: 12px; text-align: center; color: var(--color-danger); }
</style>
