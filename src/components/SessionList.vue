<template>
  <div class="session-list">
    <div v-if="conversations.length === 0" class="empty-state">
      <div class="empty-text">暂无会话</div>
      <div class="empty-hint">匹配商家后将自动创建会话</div>
    </div>
    <div
      v-for="c in conversations"
      :key="c.conversation_id"
      class="session-item"
      :class="{ active: c.conversation_id === activeConvId }"
      @click="handleClick(c)"
    >
      <div class="session-icon" :class="statusIcon(c.status)">
        {{ statusEmoji(c.status) }}
      </div>
      <div class="session-info">
        <div class="session-name">{{ displayName(c) }}</div>
        <div class="session-preview">{{ statusLabel(c.status) }}</div>
        <div class="session-demand">{{ c.demand_text?.substring(0, 30) }}{{ c.demand_text?.length > 30 ? '...' : '' }}</div>
        <div class="session-trade" v-if="c.status === 'pending_confirmation'">
          <span class="trade-badge pending">待确认</span>
        </div>
        <div class="session-trade" v-else-if="c.status === 'waiting_confirm'">
          <span class="trade-badge pending">等待确认</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useChat } from '../composables/useChat'
import { useDidStore } from '../stores/did'

const store = useDidStore()
const { conversations, activeConvId, openChat, fetchConversationDetail, statusLabel } = useChat()

function handleClick(c: any) {
  console.log(`[CHAT CLICK] did=${store.did || '-'} role=${store.identityType || '-'} conversationId=${c.conversation_id}`, c)
  openChat(c.conversation_id)
}

function displayName(c: any) {
  const a = c.consumer_agent_name || '用户'
  const b = c.provider_agent_name || '商家'
  return `${a} ↔ ${b}`
}

function statusIcon(status: string) {
  if (status === 'confirmed') return 'done'
  if (status === 'rejected') return 'done'
  if (status === 'pending_confirmation') return 'pending'
  if (status === 'waiting_confirm') return 'pending'
  if (status === 'human_chat') return 'human'
  if (status === 'waiting_online') return 'pending'
  return ''
}

function statusEmoji(status: string) {
  if (status === 'confirmed') return '✓'
  if (status === 'rejected') return '✕'
  if (status === 'pending_confirmation') return '📋'
  if (status === 'waiting_confirm') return '⏳'
  if (status === 'human_chat') return '👥'
  if (status === 'chatting') return '🤖'
  if (status === 'waiting_online') return '⏸'
  if (status === 'matching') return '🔍'
  return '💬'
}
</script>

<style scoped>
.session-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.empty-state { padding: 20px 0; text-align: center; }
.empty-text { font-size: 13px; color: var(--color-text-secondary); }
.empty-hint { font-size: 11px; color: var(--color-text-secondary); opacity: 0.6; margin-top: 4px; }

.session-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}
.session-item:hover {
  background: rgba(0, 212, 255, 0.06);
  border-color: rgba(0, 212, 255, 0.15);
}
.session-item.active {
  background: rgba(0, 212, 255, 0.08);
  border-color: rgba(0, 212, 255, 0.2);
}
.session-icon {
  width: 32px; height: 32px;
  border-radius: 50%;
  background: rgba(0, 212, 255, 0.1);
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; flex-shrink: 0;
}
.session-icon.done { background: rgba(0, 255, 136, 0.15); }
.session-icon.pending { background: rgba(255, 215, 0, 0.12); }
.session-info { flex: 1; min-width: 0; }
.session-name { font-size: 13px; font-weight: 500; margin-bottom: 2px; }
.session-preview { font-size: 11px; color: var(--color-text-secondary); }
.session-demand { font-size: 10px; color: var(--color-text-secondary); opacity: 0.6; margin-top: 2px; }
.trade-badge {
  font-size: 10px; padding: 1px 6px; border-radius: 4px;
  background: rgba(255, 215, 0, 0.12); color: #ffd700;
}
</style>
