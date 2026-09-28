<template>
  <div class="login-screen">
    <div class="center-card">
      <div class="card-title">恢复身份</div>
      <div class="card-desc">上传 identity.json 和 key.enc 文件，输入密码验证身份</div>

      <!-- 上传 identity.json -->
      <div class="upload-section">
        <label class="upload-label">identity.json（DID 文档）</label>
        <div class="drop-zone" :class="{ loaded: identityLoaded }" @click="triggerIdentityInput">
          <input ref="identityInput" type="file" accept=".json" style="display:none" @change="onIdentityFile" />
          <span>{{ identityName || '点击选择文件' }}</span>
          <span v-if="identityLoaded" class="check">✓</span>
        </div>
      </div>

      <!-- 上传 key.enc -->
      <div class="upload-section">
        <label class="upload-label">key.enc（加密私钥）</label>
        <div class="drop-zone" :class="{ loaded: keyLoaded }" @click="triggerKeyInput">
          <input ref="keyInput" type="file" accept=".enc,.bin" style="display:none" @change="onKeyFile" />
          <span>{{ keyName || '点击选择文件' }}</span>
          <span v-if="keyLoaded" class="check">✓</span>
        </div>
      </div>

      <!-- 密码 -->
      <div class="form-group">
        <label>输入加密密码</label>
        <input class="form-input" type="password" v-model="passphrase" placeholder="密码" autocomplete="current-password" />
      </div>

      <button class="btn-restore" :disabled="!canRestore || loading" @click="handleRestore">
        {{ loading ? '验证中...' : '恢复身份并登录' }}
      </button>

      <div class="status-bar error" v-if="error">{{ error }}</div>

      <button class="btn-back" @click="$router.push('/')">返回</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useDidStore } from '../stores/did'

const router = useRouter()
const store = useDidStore()

const identityInput = ref<HTMLInputElement>()
const keyInput = ref<HTMLInputElement>()

const identityName = ref('')
const identityLoaded = ref(false)
let identityDoc: any = null

const keyName = ref('')
const keyLoaded = ref(false)
let keyData: Uint8Array | null = null

const passphrase = ref('')
const loading = ref(false)
const error = ref('')

const canRestore = computed(() => identityLoaded.value && keyLoaded.value && passphrase.value.length >= 6)

function triggerIdentityInput() { identityInput.value?.click() }
function triggerKeyInput() { keyInput.value?.click() }

function onIdentityFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  identityName.value = file.name
  const reader = new FileReader()
  reader.onload = () => {
    try {
      identityDoc = JSON.parse(reader.result as string)
      if (!identityDoc.id || !identityDoc.verificationMethod) {
        error.value = '身份文件格式无效'
        identityLoaded.value = false
        return
      }
      identityLoaded.value = true
      error.value = ''
    } catch { error.value = '文件解析失败'; identityLoaded.value = false }
  }
  reader.readAsText(file)
}

function onKeyFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  keyName.value = file.name
  const reader = new FileReader()
  reader.onload = () => {
    keyData = new Uint8Array(reader.result as ArrayBuffer)
    keyLoaded.value = true
    error.value = ''
  }
  reader.readAsArrayBuffer(file)
}

async function handleRestore() {
  if (!canRestore.value || !identityDoc || !keyData) return
  loading.value = true
  error.value = ''

  try {
    // 1. 解密私钥
    const privateKey = await store.decryptPrivateKey(keyData, passphrase.value)
    if (!privateKey) {
      error.value = '密码错误或密钥文件损坏'
      return
    }

    // 2. 保存身份信息到 store
    store.setSecretKey(privateKey)
    store.setEncryptedKey(keyData)
    store.setIdentityDoc(identityDoc)

    // 3. Challenge-Response 登录
    const ok = await store.login(identityDoc.id, privateKey)
    if (!ok) {
      error.value = '身份验证失败：签名验证不通过或 DID 未注册'
      return
    }

    // 已上传文件=已备份
    store.markBackedUp()

    router.push('/main')
  } catch (e: any) {
    error.value = e.message || '恢复失败'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-screen {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-primary);
}
.center-card {
  width: 400px;
  background: var(--bg-card);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 32px 28px;
  display: flex; flex-direction: column; align-items: center;
}
.card-title { font-size: 20px; font-weight: 600; margin-bottom: 6px; }
.card-desc { font-size: 12px; color: var(--color-text-secondary); margin-bottom: 20px; text-align: center; }

.upload-section { width: 100%; margin-bottom: 12px; }
.upload-label { display: block; font-size: 11px; color: var(--color-text-secondary); margin-bottom: 4px; }

.drop-zone {
  width: 100%; padding: 12px 14px;
  border: 1px dashed var(--color-border);
  border-radius: 8px;
  display: flex; align-items: center; justify-content: space-between;
  cursor: pointer; transition: all 0.2s;
  font-size: 12px; color: var(--color-text-secondary);
}
.drop-zone:hover { border-color: var(--color-primary); }
.drop-zone.loaded { border-color: var(--color-success); color: var(--color-text); }
.check { color: var(--color-success); font-weight: 700; }

.form-group { width: 100%; margin-bottom: 14px; }
.form-group label { display: block; font-size: 12px; color: var(--color-text-secondary); margin-bottom: 4px; }

.btn-restore {
  width: 100%; margin-top: 4px; padding: 12px;
  background: linear-gradient(135deg, var(--color-primary), #0090b0);
  color: #fff; border: none; border-radius: 8px;
  font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.3s;
}
.btn-restore:hover:not(:disabled) { box-shadow: 0 0 20px rgba(0,212,255,0.4); }
.btn-restore:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-back { margin-top: 14px; background: none; border: none; color: var(--color-text-secondary); font-size: 12px; cursor: pointer; }
.btn-back:hover { color: var(--color-primary); }

.status-bar { margin-top: 10px; font-size: 12px; }
.status-bar.error { color: var(--color-danger); }
</style>
