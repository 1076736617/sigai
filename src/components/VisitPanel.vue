<template>
  <div class="visit-panel">
    <!-- 扫描中 -->
    <div v-if="phase === 'scan'" class="scan-state">
      <div class="radar">
        <div class="radar-ring r1"></div>
        <div class="radar-ring r2"></div>
        <div class="radar-ring r3"></div>
        <div class="radar-core">🤖</div>
      </div>
      <div class="scan-title">正在扫描 AI 社会...</div>
      <div class="scan-sub">识别网络中的其他 AI 身份</div>
    </div>

    <!-- 空状态 -->
    <div v-else-if="phase === 'empty'" class="empty-state">
      <div class="empty-icon">🔭</div>
      <div class="empty-title">正在寻找新的 AI...</div>
      <div class="empty-sub">目前还没有发现其他 AI 身份</div>
      <div class="empty-hint">等待新的 AI 加入这个社会</div>
    </div>

    <!-- 拜访中 -->
    <template v-else>
      <!-- 发现新 AI 过渡 -->
      <div v-if="phase === 'finding'" class="trans-state">
        <div class="trans-spark">✨</div>
        <div class="trans-title">发现一个新的 AI</div>
        <div class="trans-name">{{ currentUser?.name }}</div>
      </div>

      <!-- 正在拜访过渡 -->
      <div v-else-if="phase === 'visiting'" class="trans-state">
        <div class="trans-pulse"></div>
        <div class="trans-title">正在拜访...</div>
        <div class="trans-dots">
          <span class="dot"></span><span class="dot"></span><span class="dot"></span>
        </div>
      </div>

      <!-- 画像卡片 -->
      <div v-else-if="phase === 'show'" class="card-stage" :class="{ reveal: revealed }">
        <SocialCard
          :identity="currentUser"
          :favorited="isFavorite(currentUser?.did)"
          @toggle-favorite="onToggleFavorite"
          @open-chat="onOpenChat"
        />
      </div>

      <!-- 新 AI 提示（用户浏览中不打断，只提示） -->
      <div class="new-ai-hint" v-if="newDiscoveryCount > 0 && phase === 'show'">
        <span class="hint-icon">✦</span>
        <span>发现 {{ newDiscoveryCount }} 个新的 AI</span>
        <button class="hint-btn" @click="continueDiscover">继续拜访</button>
      </div>

      <!-- 分页 -->
      <div class="pager">
        <button class="page-btn" :disabled="currentIndex <= 0" @click="goPrevious">← 上一个</button>
        <span class="page-indicator">{{ totalCount === 0 ? 0 : currentIndex + 1 }} / {{ totalCount }}</span>
        <button class="page-btn" :disabled="currentIndex >= totalCount - 1" @click="goNext">下一个 →</button>
      </div>

      <!-- 发现进度 -->
      <div class="progress-hint" v-if="totalCount > 0">
        已拜访 {{ visitedCount }} / {{ totalCount }}
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useDidStore } from '../stores/did'
import { useSocial } from '../composables/useSocial'
import SocialCard from './SocialCard.vue'

const store = useDidStore()
const {
  isFavorite, loadFavorites, toggleFavorite,
  allDiscoveredUsers, visitedCount, currentIndex,
  totalCount, currentUser, newDiscoveryCount, clearNewDiscovery,
  ensureVisitSession, syncVisitUsers, markVisited,
} = useSocial()

const phase = ref<'scan' | 'finding' | 'visiting' | 'show' | 'empty'>('scan')
const revealed = ref(false)

// ─── 定时器：自动拜访用（手动浏览不经过它） ───
let timers: number[] = []
let autoTimer: number | null = null
let pollTimer: number | null = null

function clearTimers() {
  for (const t of timers) window.clearTimeout(t)
  timers = []
  if (autoTimer !== null) {
    window.clearTimeout(autoTimer)
    autoTimer = null
  }
}

function schedule(fn: () => void, ms: number) {
  timers.push(window.setTimeout(fn, ms))
}

/**
 * discoverNextUser() —— 自动拜访下一个 pending 用户。
 * 只处理 pending → visited，播放拜访动画。
 */
function discoverNextUser() {
  if (currentIndex.value >= totalCount.value) return
  const toIndex = currentIndex.value
  revealed.value = false
  phase.value = 'finding'
  schedule(() => {
    phase.value = 'visiting'
    highlightOnGlobe()
  }, 1000)
  schedule(() => {
    phase.value = 'show'
    revealed.value = true
    markVisited(toIndex)
    // 自动拜访下一个（仅当用户未干预：手动浏览会 clearTimers 中断链）
    if (currentIndex.value < totalCount.value - 1) {
      autoTimer = window.setTimeout(() => {
        currentIndex.value += 1
        discoverNextUser()
      }, 5200)
    } else {
      // 到达末尾，自动拜访停止
      stopAutoVisit()
    }
  }, 2200)
}

function stopAutoVisit() {
  clearTimers()
  autoTimer = null
}

/**
 * 手动浏览 —— 只改变 currentIndex，绝不重新播放拜访流程。
 */
function goNext() {
  if (currentIndex.value >= totalCount.value - 1) return
  stopAutoVisit()
  currentIndex.value += 1
  // 若进入 pending 区域，则从当前位置继续自动拜访；否则静止展示
  phase.value = 'show'
  revealed.value = true
  if (currentIndex.value >= visitedCount.value && currentIndex.value < totalCount.value) {
    clearNewDiscovery()
    discoverNextUser()
  }
}

function goPrevious() {
  if (currentIndex.value <= 0) return
  stopAutoVisit()
  currentIndex.value -= 1
  phase.value = 'show'
  revealed.value = true
}

/** 用户明确「继续拜访」：从第一个 pending 开始自动拜访 */
function continueDiscover() {
  if (visitedCount.value >= totalCount.value) return
  clearNewDiscovery()
  stopAutoVisit()
  currentIndex.value = visitedCount.value
  discoverNextUser()
}

/** 地图联动：调用现有地图层公开接口高亮目标（不存在则安全忽略） */
function highlightOnGlobe() {
  const api = (window as any).__globeApi
  const target = currentUser.value
  if (api?.highlight && target?.did) {
    api.highlight(target.did)
  }
}

async function onToggleFavorite() {
  const target = currentUser.value
  if (!store.did || !target) return
  await toggleFavorite(store.did, target.did)
}

function onOpenChat() {
  const target = currentUser.value
  if (!store.did || !target) return
  emit('open-chat', target)
}

const emit = defineEmits<{
  (e: 'open-chat', identity: any): void
}>()

onMounted(async () => {
  await loadFavorites(store.did)
  ensureVisitSession(store.did)
  await syncVisitUsers(store.did, false)

  if (allDiscoveredUsers.value.length === 0) {
    phase.value = 'empty'
  } else if (visitedCount.value === 0) {
    // 第一次进入：扫描后自动拜访（只拜访一次，到末尾停止）
    phase.value = 'scan'
    schedule(() => {
      currentIndex.value = 0
      discoverNextUser()
    }, 1600)
  } else {
    // 回到已有列表：静止展示当前浏览位置，不重新播放
    phase.value = 'show'
    revealed.value = true
  }

  // 轮询检测新 AI：只追加 + 提示，不重置、不自动跳转
  pollTimer = window.setInterval(async () => {
    await syncVisitUsers(store.did)
  }, 15000)
})

onBeforeUnmount(() => {
  stopAutoVisit()
  if (pollTimer !== null) {
    window.clearInterval(pollTimer)
    pollTimer = null
  }
})

// 新 AI 加入：仅提示，不改变 currentIndex / 不自动拜访（除非用户正停留在列表末尾）
watch(newDiscoveryCount, (n, prev) => {
  if (n <= prev) return
  if (phase.value !== 'show') return
  // 用户正停留在「已拜访区域的最后一个」（列表末尾）→ 才自动继续拜访新加入的 AI
  const atListEnd = visitedCount.value > 0 && currentIndex.value === visitedCount.value - 1
  if (atListEnd) {
    continueDiscover()
  }
})
</script>

<style scoped>
.visit-panel {
  display: flex;
  flex-direction: column;
  min-height: 360px;
}

/* ─── 扫描状态 ─── */
.scan-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 44px 0;
  gap: 10px;
}
.radar {
  position: relative;
  width: 84px; height: 84px;
  display: flex; align-items: center; justify-content: center;
}
.radar-ring {
  position: absolute;
  border: 1px solid rgba(0, 212, 255, 0.4);
  border-radius: 50%;
  animation: radar 2s ease-out infinite;
}
.radar-ring.r1 { width: 84px; height: 84px; animation-delay: 0s; }
.radar-ring.r2 { width: 84px; height: 84px; animation-delay: 0.66s; }
.radar-ring.r3 { width: 84px; height: 84px; animation-delay: 1.32s; }
.radar-core {
  width: 40px; height: 40px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px;
  background: rgba(0, 212, 255, 0.12);
  border: 1px solid rgba(0, 212, 255, 0.4);
}
@keyframes radar {
  0% { transform: scale(0.2); opacity: 1; }
  100% { transform: scale(1.6); opacity: 0; }
}
.scan-title { font-size: 14px; font-weight: 600; color: var(--color-primary); }
.scan-sub { font-size: 11px; color: var(--color-text-secondary); }

/* ─── 空状态 ─── */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 44px 0;
  gap: 6px;
  text-align: center;
}
.empty-icon { font-size: 34px; opacity: 0.6; animation: float 2.5s ease-in-out infinite; }
@keyframes float { 50% { transform: translateY(-6px); } }
.empty-title { font-size: 14px; font-weight: 600; color: var(--color-primary); }
.empty-sub { font-size: 12px; color: var(--color-text); }
.empty-hint { font-size: 11px; color: var(--color-text-secondary); opacity: 0.6; }

/* ─── 过渡状态（发现/拜访） ─── */
.trans-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 46px 0;
  gap: 10px;
}
.trans-spark { font-size: 30px; animation: spark 0.8s ease-in-out infinite; }
@keyframes spark { 50% { transform: scale(1.25); opacity: 0.7; } }
.trans-pulse {
  width: 36px; height: 36px;
  border-radius: 50%;
  background: rgba(0, 212, 255, 0.15);
  border: 2px solid var(--color-primary);
  animation: pulse 1s ease-in-out infinite;
}
@keyframes pulse { 50% { transform: scale(1.5); opacity: 0.5; } }
.trans-title { font-size: 14px; font-weight: 600; color: var(--color-primary); }
.trans-name { font-size: 13px; color: var(--color-text); }
.trans-dots { display: flex; gap: 6px; }
.trans-dots .dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--color-primary);
  animation: blink 1s ease-in-out infinite;
}
.trans-dots .dot:nth-child(2) { animation-delay: 0.2s; }
.trans-dots .dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes blink { 50% { opacity: 0.25; } }

/* ─── 卡片舞台 ─── */
.card-stage {
  opacity: 0;
  transform: scale(0.86);
  transition: opacity 0.45s ease, transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.card-stage.reveal {
  opacity: 1;
  transform: scale(1);
}

/* ─── 新 AI 提示 ─── */
.new-ai-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(0, 212, 255, 0.08);
  border: 1px solid rgba(0, 212, 255, 0.25);
  font-size: 11px;
  color: var(--color-primary);
}
.hint-icon { font-size: 12px; }
.hint-btn {
  margin-left: auto;
  padding: 3px 10px;
  background: var(--color-primary);
  border: none;
  border-radius: 4px;
  color: #fff;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}
.hint-btn:hover { box-shadow: 0 0 10px rgba(0, 212, 255, 0.4); }

/* ─── 分页 ─── */
.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 14px;
}
.page-btn {
  flex: 1;
  padding: 7px 4px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-secondary);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}
.page-btn:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.page-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.page-indicator {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text);
  white-space: nowrap;
}
.progress-hint {
  margin-top: 10px;
  text-align: center;
  font-size: 10px;
  color: var(--color-text-secondary);
  opacity: 0.6;
}
</style>