<template>
  <Teleport to="body">
    <div class="chat-detail-overlay" v-if="chatVisible" @click.self="closeChat">
    <div class="chat-detail">
      <div class="chat-header">
        <div class="chat-header-title">{{ headerTitle }}</div>
        <div class="chat-status" :class="statusClass" v-if="activeConversation">{{ statusLabel(activeConversation.status) }}</div>
        <button class="chat-close" @click="closeChat">✕</button>
      </div>
      <div class="chat-msg-box" ref="msgBoxRef">
        <div v-if="!activeConversation" class="empty-msg">请选择一个会话</div>
        <template v-else>
          <div class="msg-demand" v-if="activeConversation.demand_text">
            <span class="demand-label">需求</span>
            <span class="demand-text">{{ activeConversation.demand_text }}</span>
          </div>

          <!-- AI 协商中：loading 气泡 -->
          <div v-if="activeConversation.status === 'chatting'" class="msg-row msg-left">
            <div class="msg-bubble loading">AI 协商中...</div>
          </div>

          <!-- 等待对方上线 -->
          <div v-if="activeConversation.status === 'waiting_online'" class="msg-row msg-center">
            <div class="msg-bubble waiting">⏳ 等待对方上线，AI 协商已暂停...</div>
          </div>

          <!-- 消息列表（sender_type 区分 AI / 人工） -->
          <div
            v-for="(msg, i) in visibleMessages"
            :key="i"
            class="msg-row"
            :class="msgClass(msg)"
          >
            <div class="msg-label">{{ msgLabel(msg) }}</div>
            <div class="msg-bubble" :class="bubbleClass(msg)">{{ msg.content }}</div>
          </div>

          <!-- 交易提案（pending_confirmation / waiting_confirm / human_chat 均可查看） -->
          <div v-if="showProposal && activeConversation.proposal" class="proposal-box">
            <div class="proposal-divider"></div>
            <div class="proposal-title">交易提案</div>
            <div class="proposal-item" v-if="activeConversation.proposal.service">
              <span class="prop-label">商品/服务</span>
              <span class="prop-value">{{ activeConversation.proposal.service }}</span>
            </div>
            <div class="proposal-item" v-if="activeConversation.proposal.quantity">
              <span class="prop-label">数量</span>
              <span class="prop-value">{{ activeConversation.proposal.quantity }}</span>
            </div>
            <div class="proposal-item" v-if="activeConversation.proposal.price">
              <span class="prop-label">价格</span>
              <span class="prop-value">¥{{ activeConversation.proposal.price.amount }} {{ activeConversation.proposal.price.unit }}</span>
            </div>
            <div class="proposal-item" v-if="activeConversation.proposal.description">
              <span class="prop-label">说明</span>
              <span class="prop-value">{{ activeConversation.proposal.description }}</span>
            </div>
            <div class="proposal-item" v-if="activeConversation.proposal.delivery">
              <span class="prop-label">交付</span>
              <span class="prop-value">{{ activeConversation.proposal.delivery }}</span>
            </div>
            <div class="proposal-terms" v-if="activeConversation.proposal.terms?.length">
              <div class="prop-label">条款</div>
              <div class="term-item" v-for="(t, ti) in activeConversation.proposal.terms" :key="ti">{{ ti+1 }}. {{ t }}</div>
            </div>
            <div class="proposal-status">当前状态：{{ proposalStatusText }}</div>

            <!-- 提案阶段操作 -->
            <div class="proposal-actions" v-if="activeConversation.status === 'pending_confirmation'">
              <button class="btn-accept" @click="handleAccept">接受交易</button>
              <button class="btn-continue" @click="handleContinueChat">继续沟通</button>
            </div>
            <div class="proposal-actions" v-else-if="activeConversation.status === 'waiting_confirm'">
              <span class="waiting-hint">对方已接受交易，等待你确认</span>
              <button class="btn-accept" @click="handleAccept">接受交易</button>
            </div>
          </div>

          <!-- 人工沟通中：显示提案入口（可折叠） -->
          <div v-if="activeConversation.status === 'human_chat'" class="human-chat-banner">
            <span class="human-chat-badge">人工沟通中 · AI 已退出</span>
            <button v-if="activeConversation.proposal && Object.keys(activeConversation.proposal).length" class="btn-view-proposal" @click="proposalExpanded = !proposalExpanded">
              {{ proposalExpanded ? '收起提案' : '查看提案' }}
            </button>
          </div>
        </template>
      </div>

      <!-- 人工聊天输入框（仅 human_chat 显示） -->
      <div class="chat-input-bar" v-if="activeConversation?.status === 'human_chat'">
        <input
          v-model="draft"
          class="chat-input"
          placeholder="输入消息..."
          @keyup.enter="handleSend"
        />
        <button class="btn-send" :disabled="!draft.trim()" @click="handleSend">发送</button>
      </div>
    </div>
  </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, watch, ref, nextTick } from 'vue'
import { useChat } from '../composables/useChat'
import { useDidStore } from '../stores/did'

const { chatVisible, activeConversation, closeChat, statusLabel, confirmTrade, continueChat, sendHumanMessage, fetchConversationDetail } = useChat()
const store = useDidStore()
const msgBoxRef = ref<HTMLElement>()
const draft = ref('')
const proposalExpanded = ref(true)

const headerTitle = computed(() => {
  const c = activeConversation.value
  if (!c) return '洽谈会话'
  const a = c.consumer_agent_name || '用户'
  const b = c.provider_agent_name || '商家'
  return `${a} ↔ ${b}`
})

const statusClass = computed(() => {
  const s = activeConversation.value?.status
  if (s === 'human_chat') return 'human'
  if (s === 'confirmed') return 'done'
  if (s === 'error' || s === 'rejected') return 'bad'
  if (s === 'pending_confirmation' || s === 'waiting_confirm') return 'pending'
  if (s === 'waiting_online') return 'waiting'
  return ''
})

const showProposal = computed(() => {
  const s = activeConversation.value?.status
  return s === 'pending_confirmation' || s === 'waiting_confirm' || (s === 'human_chat' && proposalExpanded.value)
})

const proposalStatusText = computed(() => {
  const s = activeConversation.value?.status
  if (s === 'pending_confirmation') return '等待确认'
  if (s === 'waiting_confirm') return '等待对方确认'
  if (s === 'human_chat') return '进入人工沟通，提案仍可参考'
  if (s === 'confirmed') return '交易已确认'
  return ''
})

// 过滤掉 system/error 消息，只展示正式对话
const visibleMessages = computed(() => {
  const c = activeConversation.value
  if (!c) return []
  return (c.messages || []).filter(m => !m.type || m.type === 'text')
})

function isMine(msg: any): boolean {
  if (msg.sender_type === 'human') {
    return msg.sender_did === store.did
  }
  // AI 阶段：我(登录 DID) 作为 consumer 的消息靠右，否则靠左
  return msg.role === 'consumer' && store.did === activeConversation.value?.consumer_did
    || msg.role === 'provider' && store.did === activeConversation.value?.provider_did
}

function msgClass(msg: any) {
  if (msg.role === 'system') return 'msg-center'
  if (isMine(msg)) return 'msg-right'
  return 'msg-left'
}

function bubbleClass(msg: any) {
  if (msg.role === 'system') return 'system'
  if (msg.sender_type === 'human') return 'human'
  return ''
}

function msgLabel(msg: any) {
  const c = activeConversation.value
  if (msg.role === 'system') return ''
  if (msg.sender_type === 'human') {
    const me = isMine(msg)
    if (me) return '我'
    return c?.consumer_did === msg.sender_did ? (c?.consumer_agent_name || '对方') : (c?.provider_agent_name || '对方')
  }
  const name = msg.role === 'consumer' ? (c?.consumer_agent_name || '买家') : (c?.provider_agent_name || '卖家')
  return `${name} (AI)`
}

async function scrollToBottom() {
  await nextTick()
  if (msgBoxRef.value) {
    msgBoxRef.value.scrollTop = msgBoxRef.value.scrollHeight
  }
}

watch(() => [activeConversation.value?.messages?.length, activeConversation.value?.status, proposalExpanded.value], async () => {
  await scrollToBottom()
})

watch(() => activeConversation.value?.status, (s) => {
  if (s === 'human_chat') proposalExpanded.value = true
})

async function handleAccept() {
  const c = activeConversation.value
  if (!c || !store.did) return
  const j = await confirmTrade(c.conversation_id, store.did)
  if (j?.success) {
    await fetchDetail()
  }
}

async function handleContinueChat() {
  const c = activeConversation.value
  if (!c || !store.did) return
  const j = await continueChat(c.conversation_id, store.did)
  if (j?.success) {
    await fetchDetail()
  }
}

async function handleSend() {
  const c = activeConversation.value
  if (!c || !store.did || !draft.value.trim()) return
  const content = draft.value
  draft.value = ''
  await sendHumanMessage(c.conversation_id, store.did, content)
}

async function fetchDetail() {
  // 重新拉取详情确保状态/提案/消息与服务器一致
  const c = activeConversation.value
  if (c) await fetchConversationDetail(c.conversation_id)
}
</script>

<style scoped>
.chat-detail-overlay {
  position: fixed;
  bottom: 70px;
  left: 300px;
  width: 420px;
  height: 520px;
  z-index: 200;
  pointer-events: auto;
}
.chat-detail {
  width: 100%;
  height: 100%;
  background: #181b22;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
}
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
}
.chat-header-title { font-size: 14px; font-weight: 600; }
.chat-status { font-size: 11px; padding: 2px 8px; border-radius: 4px; background: rgba(0,212,255,0.1); color: var(--color-primary); }
.chat-status.human { background: rgba(0,255,136,0.12); color: var(--color-success); }
.chat-status.pending { background: rgba(255,215,0,0.12); color: #ffd700; }
.chat-status.done { background: rgba(0,255,136,0.12); color: var(--color-success); }
.chat-status.bad { background: rgba(255,51,102,0.12); color: var(--color-danger); }
.chat-status.waiting { background: rgba(255,215,0,0.12); color: #ffd700; }
.chat-close {
  background: none; border: none; color: var(--color-text-secondary);
  font-size: 16px; cursor: pointer; padding: 4px 8px; border-radius: 4px;
}
.chat-close:hover { background: rgba(255,255,255,0.06); color: var(--color-text); }
.chat-msg-box {
  flex: 1; padding: 12px; overflow-y: auto;
  display: flex; flex-direction: column; gap: 10px;
}
.empty-msg { color: var(--color-text-secondary); text-align: center; padding: 40px 0; }
.msg-demand {
  display: flex; gap: 6px; padding: 8px 10px;
  background: rgba(0,212,255,0.04); border: 1px solid rgba(0,212,255,0.1);
  border-radius: 8px; font-size: 12px;
}
.demand-label { color: var(--color-text-secondary); white-space: nowrap; }
.demand-text { color: var(--color-text); }
.msg-row { display: flex; flex-direction: column; max-width: 85%; }
.msg-left { align-self: flex-start; }
.msg-right { align-self: flex-end; align-items: flex-end; }
.msg-center { align-self: center; }
.msg-label { font-size: 10px; color: var(--color-text-secondary); margin-bottom: 3px; padding: 0 4px; }
.msg-bubble { padding: 8px 12px; border-radius: 8px; font-size: 13px; line-height: 1.6; white-space: pre-wrap; word-break: break-all; }
.msg-left .msg-bubble { background: #2a3240; border-bottom-left-radius: 4px; }
.msg-right .msg-bubble { background: rgba(0,212,255,0.15); border-bottom-right-radius: 4px; }
.msg-center .msg-bubble { background: rgba(255,183,77,0.1); font-size: 11px; }
.msg-bubble.human { background: #2f3b4e; }
.msg-bubble.system { background: rgba(255,51,102,0.12); font-size: 11px; color: var(--color-danger); }
.msg-bubble.loading { color: var(--color-text-secondary); font-style: italic; animation: pulse 1.5s ease-in-out infinite; }
.msg-bubble.waiting { color: #ffd700; font-style: italic; animation: pulse 2s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: 0.5; } }

.proposal-box { margin-top: 4px; }
.proposal-divider { height: 1px; background: linear-gradient(90deg, transparent, var(--color-primary), transparent); margin-bottom: 10px; }
.proposal-title { font-size: 14px; font-weight: 700; color: var(--color-success); text-align: center; margin-bottom: 10px; }
.proposal-item { display: flex; gap: 6px; font-size: 12px; margin-bottom: 4px; }
.prop-label { color: var(--color-text-secondary); min-width: 64px; }
.prop-value { color: var(--color-text); }
.proposal-terms { margin-top: 6px; }
.term-item { font-size: 11px; color: var(--color-text-secondary); padding-left: 12px; }
.proposal-status { font-size: 12px; margin-top: 10px; padding: 6px 10px; background: rgba(255,215,0,0.08); border-radius: 6px; color: #ffd700; }
.proposal-actions { display: flex; gap: 8px; margin-top: 10px; }
.btn-accept, .btn-continue {
  flex: 1; padding: 9px; border: none; border-radius: 6px;
  font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;
}
.btn-accept { background: rgba(0,255,136,0.15); color: var(--color-success); }
.btn-accept:hover { background: rgba(0,255,136,0.25); }
.btn-continue { background: rgba(0,212,255,0.15); color: var(--color-primary); }
.btn-continue:hover { background: rgba(0,212,255,0.25); }
.waiting-hint { flex: 1; font-size: 12px; color: var(--color-text-secondary); align-self: center; }

.human-chat-banner {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 6px 10px; margin-top: 4px;
  background: rgba(0,255,136,0.06); border: 1px solid rgba(0,255,136,0.2);
  border-radius: 8px;
}
.human-chat-badge { font-size: 11px; color: var(--color-success); }
.btn-view-proposal {
  background: none; border: 1px solid rgba(0,212,255,0.3); color: var(--color-primary);
  font-size: 11px; padding: 3px 8px; border-radius: 4px; cursor: pointer;
}
.btn-view-proposal:hover { background: rgba(0,212,255,0.1); }

.chat-input-bar {
  display: flex; gap: 8px; padding: 10px 12px;
  border-top: 1px solid var(--color-border);
}
.chat-input {
  flex: 1; padding: 8px 12px; border: 1px solid var(--color-border);
  border-radius: 6px; background: rgba(255,255,255,0.05); color: var(--color-text);
  font-size: 13px; outline: none;
}
.chat-input:focus { border-color: var(--color-primary); }
.btn-send {
  padding: 8px 16px; border: none; border-radius: 6px;
  background: var(--color-primary); color: #fff; font-size: 13px; font-weight: 600; cursor: pointer;
}
.btn-send:disabled { opacity: 0.4; cursor: not-allowed; }
</style>