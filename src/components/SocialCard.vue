<template>
  <div class="social-card">
    <div class="card-glow"></div>
    <div class="card-avatar">{{ avatarEmoji }}</div>
    <div class="card-name">{{ identity.name || shortDid(identity.did) }}</div>
    <div class="card-did mono">{{ shortDid(identity.did) }}</div>

    <div class="card-section" v-if="locationText">
      <span class="sec-lbl">📍 所在地</span>
      <span class="sec-val">{{ locationText }}</span>
    </div>

    <div class="card-section" v-if="identity.description">
      <span class="sec-lbl">👤 身份简介</span>
      <span class="sec-val desc">{{ identity.description }}</span>
    </div>

    <div class="card-section" v-if="identity.capabilities?.length">
      <span class="sec-lbl">⚡ 能力 / 擅长</span>
      <span class="sec-val">
        <span class="chip" v-for="c in identity.capabilities" :key="c">{{ c }}</span>
      </span>
    </div>

    <div class="card-section" v-if="identity.interests?.length">
      <span class="sec-lbl">🎯 兴趣</span>
      <span class="sec-val">
        <span class="chip alt" v-for="i in identity.interests" :key="i">{{ i }}</span>
      </span>
    </div>

    <div class="card-section" v-if="identity.needs?.length">
      <span class="sec-lbl">📦 需求</span>
      <span class="sec-val">
        <span class="chip warn" v-for="n in identity.needs" :key="n">{{ n }}</span>
      </span>
    </div>

    <div class="card-section" v-if="identity.services?.length">
      <span class="sec-lbl">🛠 服务 / 能提供的内容</span>
      <span class="sec-val">
        <span class="chip" v-for="s in identity.services" :key="s.name || s">{{ s.name || s }}</span>
      </span>
    </div>

    <div class="card-section" v-if="identity.goals?.length">
      <span class="sec-lbl">🚀 目标</span>
      <span class="sec-val">
        <span class="chip alt" v-for="g in identity.goals" :key="g">{{ g }}</span>
      </span>
    </div>

    <div class="card-actions">
      <button class="btn-fav" :class="{ on: favorited }" @click="onToggleFavorite">
        {{ favorited ? '★ 已收藏' : '☆ 收藏' }}
      </button>
      <button class="btn-chat" @click="onOpenChat">对话</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  identity: any
  favorited: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle-favorite'): void
  (e: 'open-chat'): void
}>()

function shortDid(did: string): string {
  if (!did) return '—'
  return did.length > 24 ? `${did.slice(0, 12)}…${did.slice(-8)}` : did
}

const locationText = computed(() => {
  const l = props.identity?.location || {}
  return [l.country, l.province, l.city].filter(Boolean).join(' / ')
})

const avatarEmoji = computed(() => {
  const t = props.identity?.identity_type
  if (t === 'provider') return '🏪'
  if (t === 'ai_identity') return '🤖'
  if (t === 'consumer') return '👤'
  return '🤖'
})

function onToggleFavorite() {
  emit('toggle-favorite')
}
function onOpenChat() {
  emit('open-chat')
}
</script>

<style scoped>
.social-card {
  position: relative;
  background: rgba(12, 16, 26, 0.9);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 18px 16px;
  text-align: center;
  overflow: hidden;
}
.card-glow {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--color-primary), transparent);
}
.card-avatar {
  width: 52px; height: 52px;
  margin: 0 auto 8px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 24px;
  background: rgba(0, 212, 255, 0.1);
  border: 1px solid rgba(0, 212, 255, 0.25);
  box-shadow: 0 0 14px rgba(0, 212, 255, 0.15);
}
.card-name {
  font-size: 15px; font-weight: 700;
  color: var(--color-primary);
  margin-bottom: 2px;
}
.card-did { font-size: 10px; color: var(--color-text-secondary); margin-bottom: 12px; }
.mono { font-family: var(--font-mono); }

.card-section {
  text-align: left;
  margin-bottom: 10px;
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
}
.sec-lbl {
  display: block;
  font-size: 10px;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
  letter-spacing: 0.5px;
}
.sec-val {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 12px;
  color: var(--color-text);
  line-height: 1.5;
}
.sec-val.desc {
  display: block;
  word-break: break-all;
  font-size: 11px;
  color: var(--color-text-secondary);
}
.chip {
  padding: 1px 7px;
  border-radius: 4px;
  font-size: 10px;
  background: rgba(0, 212, 255, 0.1);
  color: var(--color-primary);
}
.chip.alt { background: rgba(167, 139, 250, 0.12); color: #c4b5fd; }
.chip.warn { background: rgba(255, 183, 77, 0.12); color: #ffd700; }

.card-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}
.btn-fav, .btn-chat {
  flex: 1;
  padding: 8px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-fav {
  background: rgba(255, 215, 0, 0.12);
  color: #ffd700;
}
.btn-fav:hover { background: rgba(255, 215, 0, 0.22); }
.btn-fav.on {
  background: rgba(255, 215, 0, 0.25);
  box-shadow: 0 0 10px rgba(255, 215, 0, 0.2);
}
.btn-chat {
  background: linear-gradient(135deg, var(--color-primary), #0090b0);
  color: #fff;
}
.btn-chat:hover { box-shadow: 0 0 12px rgba(0, 212, 255, 0.3); }
</style>