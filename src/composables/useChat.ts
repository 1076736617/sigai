import { ref, reactive, computed, watch } from 'vue'

export interface ChatMessage {
  role: string
  content: string
  ts: number
  sender_agent_id?: number
  sender_type?: string
  sender_did?: string
  type?: string
}

export interface Conversation {
  id?: number
  conversation_id: string
  consumer_did: string
  provider_did: string
  consumer_agent_id?: number
  provider_agent_id?: number
  consumer_agent_name: string
  provider_agent_name: string
  demand_text: string
  status: string
  messages: ChatMessage[]
  proposal: any
  confirmations?: string[]
  created_at: string
  updated_at: string
}

const conversations = reactive<Conversation[]>([])
const activeConvId = ref<string | null>(null)
const chatVisible = ref(false)
const loading = ref(false)

// ─── 全局唯一轮询定时器（模块级单例，避免多组件重复启动）───
const POLL_FAST_MS = 3000       // WebSocket 断开时为兜底
const POLL_SLOW_MS = 15000      // WebSocket 正常连接时降低频率
let pollTimerId: number | null = null
let pollDid: string | null = null

let notifWs: WebSocket | null = null
let roomWs: WebSocket | null = null
let notifDid: string | null = null

const activeConversation = computed(() =>
  conversations.find(c => c.conversation_id === activeConvId.value) || null
)

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    matching: '匹配中',
    chatting: 'AI 协商中',
    waiting_online: '等待对方上线',
    pending_confirmation: '提案待确认',
    waiting_confirm: '等待对方确认',
    human_chat: '人工沟通中',
    confirmed: '已成交',
    rejected: '已终止',
    completed: '已完成',
    error: '协商失败',
  }
  return map[status] || status
}

// ─── 协商卡死兜底：长时间停留在 chatting 且无新消息 → 本地标记失败，保证 UI 永不永久显示「AI 协商中...」───
const CHATTING_STALE_MS = 120000
const chattingSince = new Map<string, number>()
const locallyFailed = new Set<string>()

function trackChattingWatchdog(conv: Conversation) {
  if (conv.status !== 'chatting' && conv.status !== 'waiting_online') {
    chattingSince.delete(conv.conversation_id)
    locallyFailed.delete(conv.conversation_id)
    return
  }
  // waiting_online 是正常暂停状态，不计入卡死计时
  if (conv.status === 'waiting_online') {
    return
  }
  if (locallyFailed.has(conv.conversation_id)) {
    conv.status = 'error'
    if (!conv.messages.some(m => m.type === 'error')) {
      conv.messages.push({ role: 'system', content: 'AI 协商超时或后端无响应，已终止。请稍后重试。', ts: Date.now() / 1000, type: 'error' })
    }
    return
  }
  if (!chattingSince.has(conv.conversation_id)) {
    chattingSince.set(conv.conversation_id, Date.now())
    return
  }
  const lastTs = conv.messages.reduce((mx, m) => Math.max(mx, m.ts || 0), 0) * 1000
  const lastActivity = Math.max(chattingSince.get(conv.conversation_id)!, lastTs || 0)
  if (Date.now() - lastActivity > CHATTING_STALE_MS) {
    console.log(`[NEGOTIATION] watchdog: conv=${conv.conversation_id} stuck in chatting, marking error`)
    locallyFailed.add(conv.conversation_id)
    conv.status = 'error'
    conv.messages.push({ role: 'system', content: 'AI 协商超时或后端无响应，已终止。请稍后重试。', ts: Date.now() / 1000, type: 'error' })
  }
}

function upsertConversation(conv: any) {
  if (!conv || !conv.conversation_id) return
  const existing = conversations.find(c => c.conversation_id === conv.conversation_id)
  if (existing) {
    Object.assign(existing, conv)
    trackChattingWatchdog(existing)
  } else {
    conversations.push(conv as Conversation)
    trackChattingWatchdog(conversations[conversations.length - 1])
  }
}

async function fetchConversations(did: string) {
  try {
    console.log(`[REQUEST_CONVERSATIONS] did=${did}`)
    const r = await fetch(`/api/conversations/list?did=${encodeURIComponent(did)}`)
    if (r.ok) {
      const j = await r.json()
      if (j.success && Array.isArray(j.data)) {
        for (const newConv of j.data) {
          upsertConversation(newConv)
        }
      }
    }
  } catch (e) { console.log(`[REQUEST_CONVERSATIONS] error did=${did}`) }
}

async function fetchConversationDetail(convId: string) {
  try {
    const r = await fetch(`/api/conversations/${convId}`)
    if (r.ok) {
      const j = await r.json()
      if (j.success && j.data) {
        upsertConversation(j.data)
        return j.data
      }
    }
  } catch {}
  try {
    // 兜底：messages 明细接口
    const r2 = await fetch(`/api/conversations/${convId}/messages`)
    if (r2.ok) {
      const j2 = await r2.json()
      console.log(`[LOAD_MESSAGES] conversation_id=${convId} count=${j2.count ?? j2.data?.length ?? 0}`)
      if (j2.success && Array.isArray(j2.data)) {
        const existing = conversations.find(c => c.conversation_id === convId)
        if (existing) existing.messages = j2.data as ChatMessage[]
      }
    }
  } catch {}
  return null
}

async function openChat(convId: string) {
  console.log(`[OPEN_CONVERSATION] id=${convId} chatVisible=${chatVisible.value} activeConvId=${activeConvId.value}`)
  activeConvId.value = convId
  chatVisible.value = true
  connectRoom(convId)
  await fetchConversationDetail(convId)
  await new Promise(r => setTimeout(r, 50))
  const el = document.querySelector('.chat-detail-overlay')
  let rect = null
  if (el) {
    const r = el.getBoundingClientRect()
    rect = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 0 && r.height > 0 }
    const cs = getComputedStyle(el)
    rect.display = cs.display
    rect.visibility = cs.visibility
    rect.zIndex = cs.zIndex
    rect.position = cs.position
    rect.parent = el.parentElement?.className
  }
  console.log(`[OPEN_CONVERSATION] DONE id=${convId} chatVisible=${chatVisible.value} activeConvId=${activeConvId.value} activeConversation=${activeConversation.value?.conversation_id || 'NULL'} msgCount=${activeConversation.value?.messages?.length ?? 0} overlay=${JSON.stringify(rect)}`)
}

function closeChat() {
  chatVisible.value = false
  activeConvId.value = null
  disconnectRoom()
}

async function confirmTrade(convId: string, userDid: string) {
  try {
    const r = await fetch('/api/trades/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: convId, user_did: userDid }),
    })
    const j = await r.json()
    if (j.success) {
      const conv = conversations.find(c => c.conversation_id === convId)
      if (conv) {
        conv.status = j.status || 'confirmed'
        conv.confirmations = j.confirmations || conv.confirmations
      }
    }
    return j
  } catch {
    return { success: false }
  }
}

async function rejectTrade(convId: string, userDid?: string) {
  try {
    const r = await fetch('/api/trades/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: convId, user_did: userDid }),
    })
    const j = await r.json()
    if (j.success) {
      const conv = conversations.find(c => c.conversation_id === convId)
      if (conv) conv.status = 'rejected'
    }
  } catch {}
}

/** 「继续沟通」：AI 退出，进入人工聊天。 */
async function continueChat(convId: string, userDid: string) {
  try {
    const r = await fetch('/api/conversations/continue-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: convId, user_did: userDid }),
    })
    const j = await r.json()
    if (j.success) {
      const conv = conversations.find(c => c.conversation_id === convId)
      if (conv) conv.status = 'human_chat'
    }
    return j
  } catch {
    return { success: false }
  }
}

/** 人工消息：直接发送给服务器保存 + 广播，绝不经 AI/LLM。 */
async function sendHumanMessage(convId: string, userDid: string, content: string): Promise<boolean> {
  if (!content.trim()) return false
  try {
    const r = await fetch(`/api/conversations/${convId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_did: userDid, content: content.trim() }),
    })
    const j = await r.json()
    if (j.success) {
      await fetchConversationDetail(convId)
      return true
    }
    return false
  } catch {
    return false
  }
}

// ─── WebSocket 连接管理 ───

function reschedulePoll() {
  if (pollTimerId === null) return
  window.clearInterval(pollTimerId)
  const wsAlive = notifWs && notifWs.readyState === WebSocket.OPEN
  const interval = wsAlive ? POLL_SLOW_MS : POLL_FAST_MS
  pollTimerId = window.setInterval(() => {
    if (pollDid) fetchConversations(pollDid)
    if (activeConvId.value) {
      fetchConversationDetail(activeConvId.value)
    }
  }, interval)
  console.log(`[POLL RESCHEDULE] interval=${interval}ms wsAlive=${!!wsAlive} did=${pollDid}`)
}

function connectNotifications(did: string) {
  if (notifDid === did && notifWs && (notifWs.readyState === WebSocket.OPEN || notifWs.readyState === WebSocket.CONNECTING)) return
  disconnectNotifications()
  notifDid = did
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${proto}//${location.host}/api/conversations/ws/user/${encodeURIComponent(did)}`
  console.log(`[WS NOTIF] connecting did=${did} url=${wsUrl}`)
  notifWs = new WebSocket(wsUrl)
  notifWs.onopen = () => {
    console.log(`[WS NOTIF] open did=${did} url=${wsUrl}`)
    if (notifWs) notifWs.send('ping')
    reschedulePoll()
  }
  notifWs.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data)
      if (msg.type === 'new_conversation') {
        // 新会话创建 → 刷新双方列表
        if (notifDid) fetchConversations(notifDid)
      } else if (msg.type === 'human_chat_started') {
        // 对方选择「继续沟通」→ 双方都进入人工沟通
        console.log(`[WS NOTIF] human_chat_started conv=${msg.conversation_id}`)
        if (notifDid) fetchConversations(notifDid)
        if (activeConvId.value === msg.conversation_id) {
          fetchConversationDetail(msg.conversation_id)
        }
      } else if (msg.type === 'trade_updated') {
        console.log(`[WS NOTIF] trade_updated conv=${msg.conversation_id} status=${msg.status}`)
        if (notifDid) fetchConversations(notifDid)
        if (activeConvId.value === msg.conversation_id) {
          fetchConversationDetail(msg.conversation_id)
        }
      } else if (msg.type === 'pong') {
        setTimeout(() => { if (notifWs) notifWs.send('ping') }, 25000)
      }
    } catch {}
  }
  notifWs.onclose = (ev) => {
    console.log(`[WS NOTIF] closed did=${did} code=${ev.code} reason=${ev.reason} wasClean=${ev.wasClean}`)
    notifWs = null
    reschedulePoll()
  }
  notifWs.onerror = (ev) => {
    console.error(`[WS NOTIF] error did=${did} url=${wsUrl}`)
    notifWs = null
  }
}

function disconnectNotifications() {
  if (notifWs) {
    notifWs.close()
    notifWs = null
  }
  notifDid = null
}

function connectRoom(convId: string) {
  disconnectRoom()
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${proto}//${location.host}/api/conversations/ws/${encodeURIComponent(convId)}`
  console.log(`[WS ROOM] connecting conv=${convId} url=${wsUrl}`)
  roomWs = new WebSocket(wsUrl)
  roomWs.onopen = () => { console.log(`[WS ROOM] open conv=${convId}`); if (roomWs) roomWs.send('ping') }
  roomWs.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data)
      if (msg.type === 'update' || msg.type === 'proposal_ready') {
        fetchConversationDetail(convId)
      }
    } catch {}
  }
  roomWs.onclose = (ev) => { console.log(`[WS ROOM] closed conv=${convId} code=${ev.code}`); roomWs = null }
  roomWs.onerror = () => { console.error(`[WS ROOM] error conv=${convId}`); roomWs = null }
}

function disconnectRoom() {
  if (roomWs) {
    roomWs.close()
    roomWs = null
  }
}

function startPolling(did: string) {
  // 1. 全局只允许一个 polling timer；已存在则复用，不重复启动
  if (pollTimerId !== null) {
    if (pollDid === did) {
      console.log(`[POLL START] already polling did=${did}, reuse existing timer`)
      return
    }
    console.log(`[POLL START] restarting for new did=${did} (was ${pollDid})`)
    stopPolling()
  }
  pollDid = did
  console.log(`[POLL START] did=${did}`)
  connectNotifications(did)
  fetchConversations(did)
  pollTimerId = window.setInterval(() => {
    if (pollDid) fetchConversations(pollDid)
    if (activeConvId.value) {
      fetchConversationDetail(activeConvId.value)
    }
  }, POLL_FAST_MS)
}

function stopPolling() {
  console.log(`[POLL STOP] did=${pollDid} wasPolling=${pollTimerId !== null}`)
  if (pollTimerId !== null) {
    clearInterval(pollTimerId)
    pollTimerId = null
  }
  pollDid = null
  disconnectNotifications()
  disconnectRoom()
}

export function useChat() {
  return {
    conversations,
    activeConvId,
    activeConversation,
    chatVisible,
    loading,
    statusLabel,
    fetchConversations,
    fetchConversationDetail,
    openChat,
    closeChat,
    confirmTrade,
    rejectTrade,
    continueChat,
    sendHumanMessage,
    startPolling,
    stopPolling,
  }
}