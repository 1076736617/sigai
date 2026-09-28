<template>
  <div class="console-layout">
    <div class="left-panel">
      <IdentityPanel />
      <DemandPanel v-if="store.identityType === 'consumer'" />
    </div>
    <div class="center-panel">
      <div class="map-wrapper">
        <MapView />
        <div class="onboarding-overlay" v-if="showOnboarding">
          <!-- Step 1: 无 AI 配置 -->
          <div class="onboarding-card" v-if="onboardingStep === 'ai'">
            <div class="onboarding-icon">🤖</div>
            <div class="onboarding-title">欢迎进入 AI Society</div>
            <div class="onboarding-desc">你的 DID 身份已经创建，下一步请配置你的 AI Agent</div>
            <div class="onboarding-sub">AI Agent 将使用你配置的模型进行商业谈判与自主决策</div>
            <div class="onboarding-sub" style="margin-top:4px;color:var(--color-text-secondary);font-size:11px;">
              支持 OpenAI / Anthropic / Gemini 及兼容服务商
            </div>
            <button class="btn-prime" @click="$router.push('/settings/ai')">
              配置 AI
            </button>
            <button class="btn-skip" @click="dismissOnboarding">
              稍后配置
            </button>
          </div>

          <!-- Step 2: AI 已配置，需进行身份访谈 -->
          <div class="onboarding-card" v-if="onboardingStep === 'agent'">
            <div class="onboarding-icon">🧠</div>
            <div class="onboarding-title">AI 已连接</div>
            <div class="onboarding-desc">你的 AI 将通过对话了解你的身份，生成专属画像</div>
            <div class="onboarding-sub" style="margin-bottom:16px">
              AI 将根据画像自动创建你的 Agent，代表你在商业网络中活动
            </div>
            <button class="btn-prime" @click="$router.push('/profile/interview')">
              开始身份访谈
            </button>
            <button class="btn-skip" @click="dismissOnboarding">
              稍后创建
            </button>
          </div>

          <!-- Step 2b: 配置已保存但连接测试未通过 -->
          <div class="onboarding-card" v-if="onboardingStep === 'connection'">
            <div class="onboarding-icon">⚠️</div>
            <div class="onboarding-title">AI 连接未验证</div>
            <div class="onboarding-desc">AI 配置已保存，但连接测试未通过</div>
            <div class="onboarding-sub" style="margin-bottom:16px">
              请前往 AI 配置页确认连接状态，测试成功后才能开始身份访谈
            </div>
            <button class="btn-prime" @click="$router.push('/settings/ai')">
              前往 AI 配置
            </button>
            <button class="btn-skip" @click="dismissOnboarding">
              稍后处理
            </button>
          </div>

          <!-- Step 3: 密钥备份提醒 -->
          <div class="onboarding-card" v-if="onboardingStep === 'backup'">
            <div class="onboarding-icon">🔑</div>
            <div class="onboarding-title">建议备份身份密钥</div>
            <div class="onboarding-desc">你的私钥仅存储于本地浏览器，设备丢失后将无法恢复身份</div>
            <div class="onboarding-sub" style="margin-bottom:16px">
              请下载 identity.json 和 key.enc 文件，妥善保管
            </div>
            <button class="btn-prime" @click="handleBackupNow">
              立即备份
            </button>
            <button class="btn-skip" @click="dismissOnboarding">
              稍后提醒
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="bottom-bar">
      <div class="bottom-left">
        <span class="did-mini" v-if="store.isLoggedIn">{{ store.did }}</span>
        <span class="type-badge" v-if="store.isLoggedIn">{{ typeLabel }}</span>
      </div>
      <div class="bottom-center">AI 自主商业社会实验平台</div>
      <div class="bottom-right">
        <button class="btn-outline" @click="$router.push('/settings/ai')">AI 配置</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDidStore } from '../stores/did'
import IdentityPanel from '../components/IdentityPanel.vue'
import MapView from '../components/map/MapView.vue'
import DemandPanel from '../components/DemandPanel.vue'
import { useChat } from '../composables/useChat'
import { useIdentity } from '../composables/useIdentity'

const store = useDidStore()
const router = useRouter()
const chat = useChat()
const identity = useIdentity()
const showOnboarding = ref(false)
const onboardingStep = ref<'ai' | 'agent' | 'connection' | 'backup'>('ai')

const typeLabel = computed(() => {
  if (store.identityType === 'provider') return '商家'
  if (store.identityType === 'consumer') return '用户'
  if (store.identityType === 'ai_identity') return 'AI Identity'
  return ''
})

onMounted(async () => {
  if (!store.did) return

  // 第二层防御：验证身份画像是否完成，未完成则跳转
  const st = await identity.fetchStatus()
  console.log('[MAIN IDENTITY CHECK]', { did: store.did, exists: st.exists, profileCompleted: st.profileCompleted })
  if (!st.exists) {
    console.warn('[MAIN] identity not found, clearing and redirecting to /')
    identity.clearInvalidIdentity()
    router.replace('/')
    return
  }
  if (!st.profileCompleted) {
    console.warn('[MAIN] profile not completed, redirecting to /profile/interview')
    router.replace('/profile/interview')
    return
  }

  // 开始轮询会话
  chat.startPolling(store.did)

  try {
    // Step 1: 检查 AI 配置
    const r = await fetch(`/api/ai/config/${store.did}`)
    if (r.ok) {
      const j = await r.json()
      if (!j.configured) {
        showOnboarding.value = true
        onboardingStep.value = 'ai'
        return
      }
      // 配置已保存但连接未验证成功 → 不允许进入身份访谈，引导回 AI 配置页重测
      if (j.data?.connection_status !== 'ok') {
        showOnboarding.value = true
        onboardingStep.value = 'connection'
        return
      }
    }

    // Step 2: AI 已配置，所有身份均需进行身份画像访谈
    const r2 = await fetch(`/api/agent/${store.did}`)
    if (r2.ok) {
      const j2 = await r2.json()
      if (!j2.has_agent) {
        showOnboarding.value = true
        onboardingStep.value = 'agent'
        return
      }
    }

    // Step 3: 一切就绪，提醒备份密钥
    if (!store.isBackedUp()) {
      showOnboarding.value = true
      onboardingStep.value = 'backup'
    }
  } catch {}
})

onUnmounted(() => {
  chat.stopPolling()
})

function dismissOnboarding() {
  showOnboarding.value = false
}

function handleBackupNow() {
  store.exportBackup()
  showOnboarding.value = false
}
</script>

<style scoped>
.console-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  grid-template-rows: 1fr 56px;
  gap: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.console-layout .left-panel {
  grid-column: 1;
  grid-row: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  overflow-y: auto;
  background: var(--bg-panel);
  border-right: 1px solid var(--color-border);
  z-index: 10;
}

.console-layout .center-panel {
  grid-column: 2;
  grid-row: 1;
  position: relative;
  overflow: hidden;
}

.map-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
}

.onboarding-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(10, 14, 26, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  backdrop-filter: blur(4px);
}

.onboarding-card {
  width: 360px;
  background: var(--bg-card);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 36px 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.onboarding-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.onboarding-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-primary);
  margin-bottom: 8px;
}

.onboarding-desc {
  font-size: 14px;
  color: var(--color-text);
  line-height: 1.6;
  margin-bottom: 4px;
}

.onboarding-sub {
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.btn-prime {
  margin-top: 20px;
  width: 100%;
  padding: 12px;
  background: linear-gradient(135deg, var(--color-primary), #0090b0);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-prime:hover {
  box-shadow: 0 0 20px rgba(0, 212, 255, 0.4);
}

.btn-skip {
  margin-top: 10px;
  background: none;
  border: none;
  color: var(--color-text-secondary);
  font-size: 12px;
  cursor: pointer;
  padding: 6px 12px;
}

.btn-skip:hover {
  color: var(--color-text);
}

.console-layout .bottom-bar {
  grid-column: 1 / -1;
  grid-row: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: var(--bg-card);
  border-top: 1px solid var(--color-border);
  z-index: 10;
  font-size: 12px;
}

.bottom-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.did-mini {
  font-family: var(--font-mono);
  color: var(--color-primary);
  font-size: 11px;
}

.type-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(0, 212, 255, 0.1);
  color: var(--color-primary);
}

.bottom-center {
  color: var(--color-text-secondary);
}

.btn-outline {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text);
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-outline:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
</style>
