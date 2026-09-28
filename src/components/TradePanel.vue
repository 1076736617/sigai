<template>
  <div class="trade-panel">
    <div v-if="pendingTrades.length === 0 && waitingTrades.length === 0 && confirmedTrades.length === 0" class="trade-empty">
      暂无交易
    </div>
    <!-- 待确认 -->
    <div v-for="c in pendingTrades" :key="c.conversation_id" class="trade-card pending">
      <div class="trade-title">{{ displayName(c) }}</div>
      <div class="trade-service" v-if="c.proposal?.service">服务：{{ c.proposal.service }}</div>
      <div class="trade-price" v-if="c.proposal?.price">价格：¥{{ c.proposal.price.amount }} {{ c.proposal.price.unit }}</div>
      <div class="trade-delivery" v-if="c.proposal?.delivery">交付：{{ c.proposal.delivery }}</div>
      <div class="trade-status-row">
        <span class="status-dot working"></span>
        <span>待确认</span>
      </div>
      <div class="btn-group">
        <button class="btn-confirm" @click="confirmTrade(c.conversation_id, store.did)">确认交易</button>
        <button class="btn-reject" @click="rejectTrade(c.conversation_id, store.did)">拒绝</button>
      </div>
    </div>
    <!-- 一方已确认，等待另一方 -->
    <div v-for="c in waitingTrades" :key="c.conversation_id" class="trade-card waiting">
      <div class="trade-title">{{ displayName(c) }}</div>
      <div class="trade-service" v-if="c.proposal?.service">服务：{{ c.proposal.service }}</div>
      <div class="trade-price" v-if="c.proposal?.price">价格：¥{{ c.proposal.price.amount }} {{ c.proposal.price.unit }}</div>
      <div class="trade-status-row">
        <span class="status-dot waiting"></span>
        <span>等待对方确认</span>
      </div>
      <div class="btn-group">
        <button class="btn-confirm" @click="confirmTrade(c.conversation_id, store.did)">确认交易</button>
        <button class="btn-reject" @click="rejectTrade(c.conversation_id, store.did)">拒绝</button>
      </div>
    </div>
    <!-- 已确认/已拒绝 -->
    <div v-for="c in confirmedTrades" :key="c.conversation_id" class="trade-card" :class="c.status">
      <div class="trade-title">{{ displayName(c) }}</div>
      <div class="trade-service" v-if="c.proposal?.service">服务：{{ c.proposal.service }}</div>
      <div class="trade-price" v-if="c.proposal?.price">价格：¥{{ c.proposal.price.amount }} {{ c.proposal.price.unit }}</div>
      <div class="trade-status-row">
        <span class="status-dot" :class="c.status === 'confirmed' ? 'online' : 'idle'"></span>
        <span>{{ c.status === 'confirmed' ? '已成交' : '已终止' }}</span>
      </div>
      <div class="trade-result" v-if="c.status === 'confirmed'">✅ 交易已确认</div>
      <div class="trade-result" v-else>❌ 交易已终止</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useDidStore } from '../stores/did'
import { useChat } from '../composables/useChat'

const store = useDidStore()
const { conversations, confirmTrade, rejectTrade, fetchConversations } = useChat()

function displayName(c: any) {
  const a = c.consumer_agent_name || '用户'
  const b = c.provider_agent_name || '商家'
  return `${a} ↔ ${b}`
}

const pendingTrades = computed(() =>
  conversations.filter(c => c.status === 'pending_confirmation')
)

const waitingTrades = computed(() =>
  conversations.filter(c => c.status === 'waiting_confirm')
)

const confirmedTrades = computed(() =>
  conversations.filter(c => c.status === 'confirmed' || c.status === 'rejected')
)

onMounted(() => {
  if (store.did) fetchConversations(store.did)
})
</script>

<style scoped>
.trade-panel { display: flex; flex-direction: column; gap: 10px; }
.trade-empty { text-align: center; padding: 30px 0; font-size: 13px; color: var(--color-text-secondary); }
.trade-card {
  background: rgba(0,0,0,0.2); border: 1px solid var(--color-border);
  border-radius: 10px; padding: 14px;
}
.trade-card.pending { border-color: rgba(255,215,0,0.3); }
.trade-card.waiting { border-color: rgba(0,212,255,0.3); }
.trade-card.confirmed { border-color: rgba(0,255,136,0.2); }
.trade-card.rejected { border-color: rgba(255,51,102,0.2); }
.trade-title { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
.trade-service, .trade-price, .trade-delivery {
  font-size: 12px; color: var(--color-text-secondary); margin-bottom: 2px;
}
.trade-status-row {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; margin: 8px 0;
}
.btn-group { display: flex; gap: 8px; }
.btn-confirm {
  flex: 1; padding: 8px; border: none; border-radius: 6px;
  background: rgba(0,255,136,0.15); color: var(--color-success);
  font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s;
}
.btn-confirm:hover { background: rgba(0,255,136,0.25); box-shadow: 0 0 10px rgba(0,255,136,0.2); }
.btn-reject {
  flex: 1; padding: 8px; border: none; border-radius: 6px;
  background: rgba(255,51,102,0.15); color: var(--color-danger);
  font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s;
}
.btn-reject:hover { background: rgba(255,51,102,0.25); }
.trade-result { font-size: 13px; text-align: center; padding: 8px; }
</style>
