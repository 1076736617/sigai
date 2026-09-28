<template>
  <div class="panel-card identity-panel">
    <!-- 身份信息（固定区，不随内容滚动） -->
    <div class="identity-info">
      <div class="card-title">去中心化身份</div>
<!--      <div class="did-display">
        <div class="did-label">DID</div>
        <div class="did-value glow-text did-truncate">{{ store.did || 'did:aib:...' }}</div>
      </div> -->
      <button class="btn-view-identity" @click="showIdentityOnMap">
        <svg class="view-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="9"/>
          <path d="M12 7.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9zM12 3v2M12 19v2M3 12h2M19 12h2"/>
        </svg>
        查看身份信息
      </button>
    <button v-if="!agentStatus.name && aiStatus.checked && aiStatus.loaded && (store.identityType === 'provider' || store.identityType === 'ai_identity')" class="btn-ai-config" @click="$router.push('/profile/interview')">
      开始身份访谈
    </button>
    <button v-if="!aiStatus.loaded && aiStatus.checked" class="btn-ai-config" @click="$router.push('/settings/ai')">
      配置 AI
    </button>
    </div>

    <!-- 功能菜单（可滚动区） -->
    <div class="function-menu">
    <!-- 功能 Tab -->
    <div class="action-tabs">
      <button class="tab-btn" :class="{ active: activeTab === 'visit' }" @click="activeTab = 'visit'">
        <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="10" r="3"/>
          <path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 10-16 0c0 3 2.7 7 8 11.7z"/>
        </svg>
        <span>拜访</span>
      </button>
      <button class="tab-btn" :class="{ active: activeTab === 'favorite' }" @click="activeTab = 'favorite'">
        <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
        <span>收藏</span>
      </button>
      <button class="tab-btn" :class="{ active: activeTab === 'chat' }" @click="activeTab = 'chat'">
        <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
        </svg>
        <span>聊天</span>
      </button>
      <button class="tab-btn" :class="{ active: activeTab === 'trade' }" @click="activeTab = 'trade'">
        <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="1" x2="12" y2="23"/>
          <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
        </svg>
        <span>交易</span>
      </button>
    </div>

    <!-- Tab 内容 -->
    <div class="tab-content">
      <SessionList v-if="activeTab === 'chat'" />
      <VisitPanel v-else-if="activeTab === 'visit'" @open-chat="openChatWith" />
      <FavoritePanel v-else-if="activeTab === 'favorite'" @open-chat="openChatWith" />
      <TradePanel v-else-if="activeTab === 'trade'" />
    </div>
    </div>

    <!-- 备份身份密钥 -->
    <div class="backup-row">
      <span class="backup-label">密钥备份</span>
      <span class="backup-status" v-if="store.isBackedUp()" style="color:var(--color-success)">
        <span class="status-dot online"></span> 已备份
      </span>
      <span class="backup-status" v-else style="color:var(--color-warning)">
        <span class="status-dot idle"></span> 未备份
      </span>
    </div>
    <button class="btn-export" @click="handleBackup">
      备份身份密钥
    </button>

    <!-- 聊天浮窗 -->
    <ChatDetail />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useDidStore } from '../stores/did'
import SessionList from './SessionList.vue'
import TradePanel from './TradePanel.vue'
import ChatDetail from './ChatDetail.vue'
import VisitPanel from './VisitPanel.vue'
import FavoritePanel from './FavoritePanel.vue'
import { useChat } from '../composables/useChat'
import { useSocial } from '../composables/useSocial'

const store = useDidStore()
const { openChat, fetchConversations } = useChat()
const { openDirectChat } = useSocial()
const activeTab = ref<'chat' | 'visit' | 'favorite' | 'trade'>('chat')

const aiStatus = reactive({ loaded: false, checked: false, model: '' })
const agentStatus = reactive({ name: '', identityType: '', tags: [] as string[] })
const locationData = reactive({ country: '', province: '', city: '' })
const agentId = ref('')

const locationText = computed(() => {
  const parts = [locationData.country, locationData.province, locationData.city].filter(Boolean)
  return parts.length ? parts.join(' ') : ''
})

const typeLabel = computed(() => {
  if (store.identityType === 'provider') return '🏪 商家'
  if (store.identityType === 'consumer') return '👤 用户'
  if (store.identityType === 'ai_identity') return '🤖 AI Identity'
  return '—'
})

const debugInfo = computed(() => {
  const lsDid = localStorage.getItem('aibs_did')
  const parsed = lsDid ? (() => { try { return JSON.parse(lsDid) } catch { return null } })() : null
  return `DID=${store.did?.slice(0, 24)}… type=${store.identityType || '-'} agentId=${agentId.value || '-'} ls=${parsed?.did?.slice(0, 24) || '∅'}`
})

onMounted(async () => {
  await checkAiConfig()
  await checkAgent()
  await checkLocation()
})

async function checkAiConfig() {
  if (!store.did) return
  try {
    const r = await fetch(`/api/ai/config/${store.did}`)
    if (r.ok) {
      const j = await r.json()
      aiStatus.checked = true
      if (j.configured && j.data) {
        aiStatus.loaded = true
        aiStatus.model = j.data.model || j.data.provider
      }
    }
  } catch {}
}

async function checkLocation() {
  if (!store.did) return
  try {
    const r = await fetch(`/api/did/location?did=${encodeURIComponent(store.did)}`)
    if (r.ok) {
      const j = await r.json()
      if (j.has_location && j.data) {
        locationData.country = j.data.country || ''
        locationData.province = j.data.province || ''
        locationData.city = j.data.city || ''
      }
    }
  } catch {}
}

async function checkAgent() {
  if (!store.did) return
  try {
    const r = await fetch(`/api/agent/${store.did}`)
    if (r.ok) {
      const j = await r.json()
      if (j.has_agent && j.data) {
        agentStatus.name = j.data.name
        agentId.value = j.data.id || ''
        const p = j.data.profile
        if (p) {
          agentStatus.identityType = p.identity_type || ''
          agentStatus.tags = p.tags || []
        }
      }
    }
  } catch {}
}

function handleBackup() {
  store.exportBackup()
}

/** 在地图上展示我的身份信息（调用地图层接口，不影响拜访高亮） */
function showIdentityOnMap() {
  const api = (window as any).__globeApi
  if (api?.showSelfInfo) {
    api.showSelfInfo()
  }
}

/** 拜访/收藏中点击「对话」：创建或打开会话 → 进入聊天菜单 */
async function openChatWith(identity: any) {
  if (!store.did || !identity?.did) return
  const conv = await openDirectChat(
    store.did,
    identity.did,
    agentStatus.name || store.did.slice(0, 12),
    identity.name || identity.did.slice(0, 12)
  )
  if (!conv) return
  activeTab.value = 'chat'
  fetchConversations(store.did)
  await new Promise(r => setTimeout(r, 100))
  openChat(conv.conversation_id)
}
</script>

<style scoped>
.identity-panel {
  position: relative;
  overflow: visible;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

/* 身份信息区：固定展示，不随内容滚动 */
.identity-info {
  flex-shrink: 0;
}

/* 功能菜单区：占满剩余高度，内容内部滚动 */
.function-menu {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.identity-panel::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--color-primary), transparent);
}

.did-display {
  text-align: center;
  margin-bottom: 14px;
  padding: 12px;
  background: rgba(0, 212, 255, 0.05);
  border-radius: 8px;
  border: 1px solid rgba(0, 212, 255, 0.15);
}

.did-label {
  font-size: 11px;
  color: var(--color-text-secondary);
  letter-spacing: 2px;
  margin-bottom: 4px;
}

.did-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-primary);
  font-family: var(--font-mono);
  word-break: break-all;
}

.did-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.credential-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  font-size: 13px;
}

.credential-row:last-of-type {
  border-bottom: none;
}

.debug-row .debug-value {
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--color-warning);
  text-align: right;
  word-break: break-all;
}

.ai-pending {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.credential-row .label {
  color: var(--color-text-secondary);
}

.credential-row .value {
  color: var(--color-text);
}

.mono {
  font-family: var(--font-mono);
  font-size: 12px;
}

/* Tab 按钮 */
.action-tabs {
  display: flex;
  gap: 4px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
}

.tab-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--color-text-secondary);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.3s;
}

.tab-btn:hover {
  color: var(--color-text);
  background: rgba(0, 212, 255, 0.06);
  border-color: rgba(0, 212, 255, 0.15);
}

.tab-btn.active {
  color: var(--color-primary);
  background: rgba(0, 212, 255, 0.08);
  border-color: rgba(0, 212, 255, 0.2);
}

.tab-icon {
  width: 18px;
  height: 18px;
}

/* Tab 内容 */
.tab-content {
  margin-top: 10px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.visit-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px 0;
  gap: 8px;
}

.placeholder-icon {
  font-size: 28px;
  opacity: 0.5;
}

.placeholder-text {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.backup-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10px;
  padding: 4px 0;
  font-size: 12px;
}
.backup-label {
  color: var(--color-text-secondary);
}
.backup-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.btn-export {
  margin-top: 4px;
  width: 100%;
  padding: 8px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-secondary);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-export:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.btn-ai-config {
  width: 100%;
  margin-top: 4px;
  padding: 7px;
  background: linear-gradient(135deg, var(--color-primary), #0090b0);
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}
.btn-ai-config:hover {
  box-shadow: 0 0 12px rgba(0,212,255,0.3);
}

.btn-view-identity {
  width: 100%;
  margin-top: 4px;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: rgba(0, 212, 255, 0.08);
  border: 1px solid rgba(0, 212, 255, 0.25);
  border-radius: 6px;
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-view-identity:hover {
  background: rgba(0, 212, 255, 0.15);
  border-color: var(--color-primary);
  box-shadow: 0 0 12px rgba(0, 212, 255, 0.25);
}
.view-icon {
  width: 15px;
  height: 15px;
}

.profile-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-top: 4px;
  margin-bottom: 2px;
}
.mini-tag {
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  background: rgba(0,212,255,0.1);
  color: var(--color-primary);
}

</style>
