<template>
  <div class="create-screen">
    <div class="center-card">
      <div class="card-title">你的 AI 身份画像</div>
      <div class="card-desc">AI 已根据访谈结果生成你的画像，确认后创建 Agent</div>

      <div class="loading-area" v-if="loading">
        <div class="loading-spinner"></div>
        <div class="loading-text">加载画像中...</div>
      </div>

      <div class="notice-area" v-else-if="!hasProfile">
        <div class="notice-icon">📋</div>
        <div class="notice-text">尚未完成身份访谈</div>
        <div class="notice-sub">请先完成 AI 访谈，生成你的专属画像</div>
        <button class="btn-primary" @click="$router.push('/profile/interview')">
          开始身份访谈
        </button>
      </div>

      <template v-else>
        <div class="profile-card">
          <div class="profile-header">
            <div class="profile-avatar">{{ avatarEmoji }}</div>
            <div class="profile-meta">
              <div class="profile-name">{{ profile.nickname || 'AI Agent' }}</div>
              <div class="profile-type">{{ typeLabel(profile.identity_type) }}</div>
            </div>
          </div>

          <!-- Provider: business_profile -->
          <div class="profile-section" v-if="profile.category || profile.business_profile?.industry">
            <div class="section-label">商业能力</div>
            <div class="section-text">{{ profile.category || profile.business_profile?.industry }}</div>
          </div>
          <div class="profile-section" v-if="capabilities.length">
            <div class="section-label">提供服务</div>
            <div class="tag-row">
              <span class="tag" v-for="c in capabilities" :key="c.service_name">✓ {{ c.service_name }}</span>
            </div>
          </div>
          <div class="profile-section" v-if="aiExpertise.length">
            <div class="section-label">AI能力</div>
            <div class="tag-row">
              <span class="tag" v-for="e in aiExpertise" :key="e">✓ {{ e }}</span>
            </div>
          </div>
          <div class="profile-section" v-if="profile.description">
            <div class="section-label">业务描述</div>
            <div class="section-text">{{ profile.description }}</div>
          </div>
          <div class="profile-section" v-if="profile.business_profile?.target_customers?.length">
            <div class="section-label">目标客户</div>
            <div class="section-text">{{ profile.business_profile.target_customers.join('、') }}</div>
          </div>
          <div class="profile-section" v-if="profile.business_profile?.service_area">
            <div class="section-label">服务区域</div>
            <div class="section-text">{{ profile.business_profile.service_area }}</div>
          </div>
          <div class="profile-section" v-if="pricingText">
            <div class="section-label">定价</div>
            <div class="section-text">{{ pricingText }}</div>
          </div>
        </div>

        <button class="btn-primary" :disabled="creating" @click="handleCreate">
          {{ creating ? '创建中...' : '确认并创建 Agent' }}
        </button>

        <button class="btn-retake" @click="$router.push('/profile/interview')">
          重新访谈
        </button>
      </template>

      <div class="status-bar error" v-if="error">{{ error }}</div>
      <div class="status-bar success" v-if="created">Agent 创建成功！正在跳转...</div>

      <button class="btn-back" @click="$router.push('/main')">返回主界面</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDidStore } from '../stores/did'

const router = useRouter()
const store = useDidStore()

const loading = ref(true)
const hasProfile = ref(false)
const creating = ref(false)
const created = ref(false)
const error = ref('')
const profile = ref<any>({})

const capabilities = computed(() => {
  const caps = profile.value.capabilities || []
  return caps.length ? caps.map((c: any) => ({ service_name: c.service_name || c.name || c })) : []
})

const aiExpertise = computed(() => {
  if (Array.isArray(profile.value.ai_profile?.expertise)) return profile.value.ai_profile.expertise
  return []
})

const pricingText = computed(() => {
  const p = profile.value.pricing || {}
  if (p.max) return `¥${p.min}-${p.max}${p.unit || ''}`
  const r = profile.value.basic_info?.price_range
  if (r?.max) return `¥${r.min}-${r.max}${r.currency || 'CNY'}`
  return ''
})

const emojiMap: Record<string, string> = {
  provider: '🏪', consumer: '👤', ai_identity: '🤖',
}

const avatarEmoji = computed(() => emojiMap[profile.value.identity_type] || '🤖')

function typeLabel(t: string) {
  const map: Record<string, string> = {
    provider: '商家', consumer: '用户', ai_identity: 'AI Identity',
  }
  return map[t] || t
}

onMounted(async () => {
  if (!store.did) {
    error.value = '请先创建 DID 身份'
    loading.value = false
    return
  }

  try {
    // 优先读 v2 完整画像，回退 v1
    const r = await fetch(`/api/profile/provider/${store.did}`)
    if (r.ok) {
      const j = await r.json()
      if (j.has_profile && j.data) {
        profile.value = j.data
        hasProfile.value = true
      }
    }
    if (!hasProfile.value) {
      const r2 = await fetch(`/api/profile/${store.did}`)
      if (r2.ok) {
        const j2 = await r2.json()
        if (j2.has_profile && j2.data) {
          profile.value = j2.data
          hasProfile.value = true
        }
      }
    }
  } catch {}
  loading.value = false
})

async function handleCreate() {
  creating.value = true
  error.value = ''

  try {
    const name = profile.value.basic_info?.name ||
      profile.value.nickname || 'AI Agent'
    const desc = profile.value.basic_info?.description ||
      profile.value.ai_summary || ''
    const r = await fetch('/api/agent/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        did: store.did,
        name,
        type: profile.value.identity_type || store.identityType || 'ai_identity',
        description: desc,
        profile_id: profile.value.id,
      }),
    })
    const j = await r.json()
    if (j.success) {
      created.value = true
      setTimeout(() => router.push('/main'), 1500)
    } else {
      error.value = j.detail || '创建失败'
    }
  } catch (e: any) {
    error.value = e.message || '网络错误'
  } finally {
    creating.value = false
  }
}
</script>

<style scoped>
.create-screen {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-primary);
  position: relative; overflow-y: auto;
}
.center-card {
  width: 460px;
  background: var(--bg-card);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 32px 28px;
  display: flex; flex-direction: column;
  margin: 20px;
}
.card-title { font-size: 20px; font-weight: 600; margin-bottom: 4px; }
.card-desc { font-size: 12px; color: var(--color-text-secondary); margin-bottom: 20px; }

.loading-area { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 40px 0; }
.loading-spinner {
  width: 32px; height: 32px;
  border: 3px solid rgba(0,212,255,0.15);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.loading-text { font-size: 13px; color: var(--color-text-secondary); }

.notice-area { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 30px 0; }
.notice-icon { font-size: 40px; }
.notice-text { font-size: 15px; font-weight: 600; }
.notice-sub { font-size: 12px; color: var(--color-text-secondary); margin-bottom: 8px; }

.profile-card {
  background: rgba(0,212,255,0.04);
  border: 1px solid rgba(0,212,255,0.12);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
}
.profile-header {
  display: flex; align-items: center; gap: 12px;
  margin-bottom: 16px;
}
.profile-avatar {
  width: 48px; height: 48px;
  border-radius: 50%;
  background: rgba(0,212,255,0.1);
  display: flex; align-items: center; justify-content: center;
  font-size: 24px;
}
.profile-meta { display: flex; flex-direction: column; gap: 2px; }
.profile-name { font-size: 18px; font-weight: 700; }
.profile-type { font-size: 12px; color: var(--color-primary); }

.profile-section { margin-bottom: 12px; }
.section-label { font-size: 11px; color: var(--color-text-secondary); margin-bottom: 4px; letter-spacing: 1px; }
.section-text { font-size: 13px; color: var(--color-text); line-height: 1.6; white-space: pre-wrap; }

.tag-row { display: flex; flex-wrap: wrap; gap: 4px; }
.tag {
  padding: 3px 10px; border-radius: 12px;
  font-size: 12px;
  background: rgba(0,212,255,0.1);
  color: var(--color-primary);
}
.tag.need {
  background: rgba(255,183,77,0.15);
  color: #ffb74d;
}

.btn-primary {
  width: 100%; padding: 12px;
  background: linear-gradient(135deg, var(--color-primary), #0090b0);
  color: #fff; border: none; border-radius: 8px;
  font-size: 14px; font-weight: 700; cursor: pointer;
  transition: all 0.3s;
}
.btn-primary:hover:not(:disabled) { box-shadow: 0 0 16px rgba(0,212,255,0.4); }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-retake {
  width: 100%; margin-top: 8px;
  padding: 8px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-retake:hover { border-color: var(--color-primary); color: var(--color-primary); }

.btn-back { margin-top: 14px; background: none; border: none; color: var(--color-text-secondary); font-size: 12px; cursor: pointer; }
.btn-back:hover { color: var(--color-primary); }

.status-bar { margin-top: 8px; font-size: 12px; text-align: center; }
.status-bar.error { color: var(--color-danger); }
.status-bar.success { color: var(--color-success); }
</style>
