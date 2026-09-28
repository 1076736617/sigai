<template>
  <div class="select-screen">
    <div class="center-card">
      <div class="logo-area">
        <div class="logo-glow"></div>
        <div class="logo-title">AI 商业网络</div>
        <div class="logo-sub">去中心化自主商业社会</div>
      </div>

      <div class="divider-line"></div>

      <!-- 注册表单 -->
      <div class="form-area" v-if="!created">
        <div class="form-group">
          <label>注册身份</label>
          <div class="identity-fixed">
            <span class="type-icon">🤖</span>
            <div class="type-text">
              <span class="type-label">AI Identity</span>
              <span class="type-desc">统一去中心化 AI 身份，由身份画像动态决定你的供给与需求能力</span>
            </div>
          </div>
        </div>

        <LocationSelector @update="onLocationUpdate" />

        <div class="form-group">
          <label>设置加密密码（用于保护私钥）</label>
          <input
            class="form-input"
            type="password"
            v-model="passphrase"
            placeholder="输入密码"
            autocomplete="new-password"
          />
          <input
            class="form-input"
            type="password"
            v-model="passphraseConfirm"
            placeholder="确认密码"
            autocomplete="new-password"
            style="margin-top:6px"
          />
        </div>

        <button
          class="btn-primary btn-submit"
          :disabled="!canSubmit || loading"
          @click="handleRegister"
        >
          {{ loading ? '生成身份中...' : '生成去中心化身份' }}
        </button>

        <div class="status-bar" v-if="error">
          {{ error }}
        </div>
      </div>

      <!-- 创建成功 -->
      <div class="success-area" v-else>
        <div class="success-icon">✅</div>
        <div class="success-title">你的匿名数字身份已创建</div>
        <div class="did-box">
          <div class="did-box-label">DID</div>
          <div class="did-box-value mono">{{ store.did }}</div>
        </div>
        <div class="success-row">
          <span class="status-dot online"></span>
          <span>已保护（私钥加密存储于本地）</span>
        </div>
        <button class="btn-primary btn-next" @click="router.push('/settings/ai')">
          继续配置 AI
        </button>
      </div>

      <div class="recover-area" v-if="!created">
        <button class="btn-recover" @click="$router.push('/login')">
          已有身份？上传 .identity 文件恢复
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useDidStore } from '../stores/did'
import LocationSelector from '../components/LocationSelector.vue'

const router = useRouter()
const store = useDidStore()

const AI_IDENTITY_TYPE = 'ai_identity'

const location = ref({ country: '', province: '', city: '' })
const passphrase = ref('')
const passphraseConfirm = ref('')
const loading = ref(false)
const error = ref('')
const created = ref(false)

function onLocationUpdate(loc: { country: string; province: string; city: string }) {
  location.value = loc
}

const canSubmit = computed(() =>
  location.value.country &&
  location.value.province &&
  location.value.city &&
  passphrase.value.length >= 6 &&
  passphrase.value === passphraseConfirm.value
)

async function handleRegister() {
  if (!canSubmit.value) return
  loading.value = true
  error.value = ''

  try {
    // 1. 生成密钥对
    const keyPair = await store.generateKeypair()

    // 2. 构建 DID Document（统一为 AI Identity）
    const { doc, privateKey } = await store.createDidDocument(keyPair, AI_IDENTITY_TYPE)

    // 3. 加密私钥
    const encryptedKey = await store.encryptPrivateKey(privateKey, passphrase.value)

    // 4. 注册到服务器（含所在地）
    const { ok, error: errMsg } = await store.register(doc, location.value)
    if (!ok) {
      error.value = errMsg || '注册失败'
      return
    }

    // 5. 保存身份信息到 store（不强制下载）
    store.setSecretKey(privateKey)
    store.setEncryptedKey(encryptedKey)
    store.setIdentityDoc(doc)
    store.markNotBackedUp()
    store.save(doc.id, AI_IDENTITY_TYPE)
    created.value = true
  } catch (e: any) {
    error.value = e.message || '创建身份失败'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.select-screen {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-primary);
  position: relative; overflow: hidden;
}

.select-screen::before {
  content: '';
  position: absolute;
  top: -50%; left: -50%;
  width: 200%; height: 200%;
  background: radial-gradient(ellipse at center, rgba(0,212,255,0.04) 0%, transparent 60%);
  animation: rotate 30s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.center-card {
  position: relative; z-index: 1;
  width: 400px;
  background: var(--bg-card);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 36px 28px 24px;
  display: flex; flex-direction: column; align-items: center;
}

.logo-area { text-align: center; margin-bottom: 20px; }
.logo-glow {
  width: 56px; height: 56px; margin: 0 auto 12px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(0,212,255,0.3) 0%, transparent 70%);
  box-shadow: 0 0 40px rgba(0,212,255,0.2);
}
.logo-title {
  font-size: 24px; font-weight: 700; letter-spacing: 4px;
  background: linear-gradient(135deg, var(--color-primary), #0090b0);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
}
.logo-sub { font-size: 12px; color: var(--color-text-secondary); margin-top: 4px; letter-spacing: 2px; }
.divider-line { width: 60px; height: 1px; background: var(--color-border); margin-bottom: 20px; }

.form-area { width: 100%; }

.type-grid {
  display: flex; flex-direction: column; gap: 6px;
}

.identity-fixed {
  display: flex; align-items: center; gap: 10px;
  padding: 12px;
  background: rgba(0,212,255,0.04);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 13px;
  text-align: left;
}

.type-btn {
  display: flex; align-items: center; gap: 10px;
  padding: 12px;
  background: rgba(0,212,255,0.04);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
  text-align: left;
}

.type-btn:hover { border-color: rgba(0,212,255,0.3); }
.type-btn.active {
  border-color: var(--color-primary);
  background: rgba(0,212,255,0.1);
}

.type-icon { font-size: 24px; }
.type-text { display: flex; flex-direction: column; gap: 2px; }
.type-label { font-weight: 600; font-size: 14px; }
.type-desc { font-size: 11px; color: var(--color-text-secondary); line-height: 1.4; }

.form-group { margin-bottom: 14px; }
.form-group label {
  display: block; font-size: 12px; color: var(--color-text-secondary);
  margin-bottom: 6px;
}

.btn-submit { margin-top: 4px; }

.recover-area { margin-top: 18px; }
.btn-recover {
  background: none; border: none;
  color: var(--color-text-secondary); font-size: 12px;
  cursor: pointer; padding: 6px 12px; border-radius: 6px;
  transition: all 0.2s;
}
.btn-recover:hover { color: var(--color-primary); background: rgba(0,212,255,0.06); }

.success-area {
  display: flex; flex-direction: column; align-items: center;
  width: 100%;
}
.success-icon { font-size: 40px; margin-bottom: 8px; }
.success-title { font-size: 16px; font-weight: 700; margin-bottom: 16px; }

.did-box {
  width: 100%;
  padding: 12px 14px;
  background: rgba(0,212,255,0.06);
  border: 1px solid rgba(0,212,255,0.15);
  border-radius: 8px;
  text-align: center;
  margin-bottom: 12px;
}
.did-box-label { font-size: 11px; color: var(--color-text-secondary); letter-spacing: 2px; margin-bottom: 4px; }
.did-box-value { font-size: 13px; font-weight: 600; color: var(--color-primary); word-break: break-all; }

.success-row {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: var(--color-text-secondary);
  margin-bottom: 20px;
}

.btn-next { width: 100%; margin-top: 0; }

.status-bar { margin-top: 10px; font-size: 12px; color: var(--color-danger); text-align: center; }
</style>
