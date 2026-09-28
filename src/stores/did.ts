import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as nacl from 'tweetnacl'
import { decodeUTF8 } from 'tweetnacl-util'
import bs58 from 'bs58'

const STORAGE_KEY = 'aibs_did'
const BACKUP_KEY = 'aibs_backup'

// ─── 工具函数 ───

function uint8ToHex(u: Uint8Array): string {
  return Array.from(u).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data))
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/** 规范 JSON 序列化：全层级 key 排序 + 无缩进，与 Python json.dumps(sort_keys=True) 对齐 */
function canonicalJson(obj: any): string {
  return JSON.stringify(obj, (_key, value) => {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return Object.keys(value).sort().reduce((acc: any, k: string) => {
        acc[k] = value[k]
        return acc
      }, {} as any)
    }
    return value
  })
}

// ─── 导出类型 ───

export interface DidIdentity {
  did: string
  type: string
}

// ─── Store ───

export const useDidStore = defineStore('did', () => {
  const did = ref('')
  const identityType = ref('')
  // 登录成功后临时持有（仅内存，不持久化）
  let _secretKey: Uint8Array | null = null
  // 加密私钥 + identity 文档（用于后续备份，不持久化到 localStorage）
  let _encryptedKey: Uint8Array | null = null
  let _identityDoc: any = null

  const isLoggedIn = computed(() => !!did.value)

  // ─── 本地存储 ───

  function load() {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      try {
        const data = JSON.parse(raw)
        did.value = data.did || ''
        identityType.value = data.type || ''
      } catch { clear() }
    }
  }

  function save(didVal: string, typeVal: string) {
    did.value = didVal
    identityType.value = typeVal
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ did: didVal, type: typeVal }))
  }

  function clear() {
    did.value = ''
    identityType.value = ''
    _secretKey = null
    localStorage.removeItem(STORAGE_KEY)
  }

  // ─── 密钥生成 ───

  async function generateKeypair() {
    return nacl.sign.keyPair()
  }

  // ─── DID 计算 ───

  async function pubkeyToDid(pubkey: Uint8Array): Promise<string> {
    const h = await sha256(pubkey)
    return 'did:aib:' + bs58.encode(h)
  }

  // ─── 构建 DID Document ───

  async function createDidDocument(keyPair: nacl.SignKeyPair, type: string): Promise<{ doc: any, privateKey: Uint8Array }> {
    const did = await pubkeyToDid(keyPair.publicKey)
    const now = new Date().toISOString()
    const pubkeyMultibase = 'z' + bs58.encode(keyPair.publicKey)

    const doc: any = {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1',
      ],
      id: did,
      version: 1,
      type,
      created: now,
      updated: now,
      verificationMethod: [
        {
          id: did + '#keys-1',
          type: 'Ed25519VerificationKey2020',
          controller: did,
          publicKeyMultibase: pubkeyMultibase,
        },
      ],
      authentication: [did + '#keys-1'],
      service: [],
    }

    // 签名：document → canonical JSON → Uint8Array → Ed25519 sign
    const docForSign = { ...doc }
    const payloadStr = canonicalJson(docForSign)
    const payloadBytes = decodeUTF8(payloadStr)
    const signature = nacl.sign.detached(payloadBytes, keyPair.secretKey)

    doc.proof = {
      type: 'Ed25519Signature2020',
      created: now,
      verificationMethod: did + '#keys-1',
      proofPurpose: 'assertionMethod',
      proofValue: bs58.encode(signature),
    }

    return { doc, privateKey: keyPair.secretKey }
  }

  // ─── 加密私钥（AES-256-GCM）───

  async function encryptPrivateKey(privateKey: Uint8Array, passphrase: string): Promise<Uint8Array> {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const key = await deriveKey(passphrase, salt)
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, privateKey))
    const result = new Uint8Array(salt.length + iv.length + ciphertext.length)
    result.set(salt, 0)
    result.set(iv, salt.length)
    result.set(ciphertext, salt.length + iv.length)
    return result
  }

  // ─── 解密私钥 ───

  async function decryptPrivateKey(encrypted: Uint8Array, passphrase: string): Promise<Uint8Array | null> {
    try {
      const salt = encrypted.slice(0, 16)
      const iv = encrypted.slice(16, 28)
      const data = encrypted.slice(28)
      const key = await deriveKey(passphrase, salt)
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
      return new Uint8Array(plain)
    } catch {
      return null
    }
  }

  // ─── 签名 challenge ───

  function signChallenge(challengeHex: string, secretKey: Uint8Array): string {
    const challenge = new Uint8Array(challengeHex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)))
    const sig = nacl.sign.detached(challenge, secretKey)
    return uint8ToHex(sig)
  }

  // ─── 导出身份文件 ───

  function _downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportIdentityFile(doc: any) {
    const json = JSON.stringify(doc, null, 2)
    _downloadBlob(new Blob([json], { type: 'application/json' }), 'identity.json')
  }

  function exportKeyFile(encryptedKey: Uint8Array) {
    _downloadBlob(new Blob([encryptedKey], { type: 'application/octet-stream' }), 'key.enc')
  }

  // ─── 备份相关 ───

  function setEncryptedKey(bytes: Uint8Array) {
    _encryptedKey = bytes
  }

  function setIdentityDoc(doc: any) {
    _identityDoc = doc
  }

  function isBackedUp(): boolean {
    return localStorage.getItem(BACKUP_KEY) === 'true'
  }

  function markBackedUp() {
    localStorage.setItem(BACKUP_KEY, 'true')
  }

  function markNotBackedUp() {
    localStorage.setItem(BACKUP_KEY, 'false')
  }

  function exportBackup() {
    if (_identityDoc) {
      exportIdentityFile(_identityDoc)
    }
    if (_encryptedKey) {
      exportKeyFile(_encryptedKey)
    }
    markBackedUp()
  }

  // ─── 设置内存密钥（登录后） ───

  function setSecretKey(sk: Uint8Array) {
    _secretKey = sk
  }

  function getSecretKey(): Uint8Array | null {
    return _secretKey
  }

  // ─── 注册 ───

  async function register(doc: any, location?: { country: string; province: string; city: string }): Promise<{ ok: boolean; error?: string }> {
    const publicKeyMultibase = doc.verificationMethod?.[0]?.publicKeyMultibase || ''
    const signature = doc.proof?.proofValue || ''

    const body: Record<string, any> = {
      type: doc.type,
      did_document: doc,
      public_key: publicKeyMultibase,
      signature,
    }
    if (location && location.country) {
      body.location = location
    }
    const res = await fetch('/api/did/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (res.ok && json.success) {
      return { ok: true }
    }
    return { ok: false, error: json.detail || json.message || '注册失败' }
  }

  // ─── Challenge-Response 登录 ───

  async function login(didVal: string, secretKey: Uint8Array): Promise<boolean> {
    // 1. 请求 challenge
    const chRes = await fetch('/api/did/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ did: didVal }),
    })
    const chJson = await chRes.json()
    if (!chJson.success) return false

    // 2. 签名
    const signature = signChallenge(chJson.data.challenge, secretKey)

    // 3. 验证
    const vRes = await fetch('/api/did/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ did: didVal, signature }),
    })
    const vJson = await vRes.json()
    if (vJson.success) {
      setSecretKey(secretKey)
      save(vJson.data.did, vJson.data.type)
      return true
    }
    return false
  }

  return {
    did, identityType, isLoggedIn,
    load, save, clear,
    generateKeypair, createDidDocument,
    pubkeyToDid, encryptPrivateKey, decryptPrivateKey,
    signChallenge, exportIdentityFile, exportKeyFile,
    setSecretKey, getSecretKey,
    setEncryptedKey, setIdentityDoc,
    isBackedUp, markBackedUp, markNotBackedUp, exportBackup,
    register, login,
  }
})
