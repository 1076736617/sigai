<template>
  <div class="favorite-panel">
    <!-- 加载 -->
    <div v-if="loading" class="load-state">
      <div class="load-pulse"></div>
      <div class="load-text">正在加载收藏...</div>
    </div>

    <!-- 空状态 -->
    <div v-else-if="favorites.length === 0" class="empty-state">
      <div class="empty-icon">⭐</div>
      <div class="empty-title">还没有收藏任何 AI</div>
      <div class="empty-sub">去「拜访」发现并收藏感兴趣的 AI 身份</div>
    </div>

    <!-- 收藏列表 -->
    <template v-else>
      <div class="card-stage" :class="{ reveal: revealed }">
        <SocialCard
          :identity="currentFavorite"
          :favorited="true"
          @toggle-favorite="onRemove(currentFavorite)"
          @open-chat="onOpenChat(currentFavorite)"
        />
      </div>

      <!-- 分页 -->
      <div class="pager">
        <button class="page-btn" :disabled="currentIndex <= 0" @click="goPrevious">← 上一个</button>
        <span class="page-indicator">{{ favorites.length === 0 ? 0 : currentIndex + 1 }} / {{ favorites.length }}</span>
        <button class="page-btn" :disabled="currentIndex >= favorites.length - 1" @click="goNext">下一个 →</button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useDidStore } from '../stores/did'
import { useSocial } from '../composables/useSocial'
import SocialCard from './SocialCard.vue'

const store = useDidStore()
const { unfavorite } = useSocial()

const favorites = ref<any[]>([])
const loading = ref(true)
const removing = ref<string | null>(null)
const currentIndex = ref(0)
const revealed = ref(false)
const emit = defineEmits<{
  (e: 'open-chat', identity: any): void
}>()

const currentFavorite = computed(() => favorites.value[currentIndex.value] || favorites.value[0] || null)

let timers: number[] = []
function clearTimers() {
  for (const t of timers) window.clearTimeout(t)
  timers = []
}

async function load() {
  loading.value = true
  try {
    const r = await fetch(`/api/social/favorites?did=${encodeURIComponent(store.did)}`)
    if (r.ok) {
      const j = await r.json()
      if (j.success) {
        favorites.value = j.data || []
        currentIndex.value = 0
        revealed.value = true
      }
    }
  } catch {}
  loading.value = false
}

function goNext() {
  if (currentIndex.value >= favorites.value.length - 1) return
  currentIndex.value += 1
  revealed.value = false
  timers.push(window.setTimeout(() => { revealed.value = true }, 40))
}

function goPrevious() {
  if (currentIndex.value <= 0) return
  currentIndex.value -= 1
  revealed.value = false
  timers.push(window.setTimeout(() => { revealed.value = true }, 40))
}

async function onRemove(f: any) {
  if (!store.did || !f) return
  removing.value = f.did
  await new Promise(r => timers.push(window.setTimeout(r, 300))) // 淡出动画
  const ok = await unfavorite(store.did, f.did)
  removing.value = null
  if (ok) {
    favorites.value = favorites.value.filter(x => x.did !== f.did)
    if (currentIndex.value >= favorites.value.length) {
      currentIndex.value = Math.max(0, favorites.value.length - 1)
    }
    revealed.value = true
  }
}

function onOpenChat(f: any) {
  if (!f) return
  emit('open-chat', f)
}

onMounted(load)
onBeforeUnmount(clearTimers)
</script>

<style scoped>
.favorite-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 360px;
}

/* 加载 */
.load-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 44px 0;
  gap: 10px;
}
.load-pulse {
  width: 30px; height: 30px;
  border-radius: 50%;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.load-text { font-size: 12px; color: var(--color-text-secondary); }

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 44px 0;
  gap: 6px;
  text-align: center;
}
.empty-icon { font-size: 34px; opacity: 0.6; }
.empty-title { font-size: 14px; font-weight: 600; color: var(--color-primary); }
.empty-sub { font-size: 11px; color: var(--color-text-secondary); }

/* 卡片舞台 */
.card-stage {
  opacity: 0;
  transform: scale(0.86);
  transition: opacity 0.45s ease, transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.card-stage.reveal {
  opacity: 1;
  transform: scale(1);
}

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
</style>