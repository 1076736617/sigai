import { ref, computed } from 'vue'
import { useDidStore } from '../stores/did'

export interface IdentityStatus {
  did: string | null
  exists: boolean
  profileCompleted: boolean
  identityType?: string
}

const status = ref<IdentityStatus>({
  did: null,
  exists: false,
  profileCompleted: false,
})

const loading = ref(false)
const checked = ref(false)

export function useIdentity() {
  const store = useDidStore()

  const hasDid = computed(() => !!store.did)
  const isLoggedIn = computed(() => store.isLoggedIn)
  const isProfileCompleted = computed(() => status.value.profileCompleted)
  const isIdentityExists = computed(() => status.value.exists)

  /**
   * 从后端获取身份状态（路由守卫核心）
   * 返回 IdentityStatus，调用方可据此决定跳转
   */
  async function fetchStatus(): Promise<IdentityStatus> {
    if (!store.did) {
      status.value = { did: null, exists: false, profileCompleted: false }
      checked.value = true
      return status.value
    }

    loading.value = true
    try {
      const res = await fetch(`/api/did/status?did=${encodeURIComponent(store.did)}`)
      if (!res.ok) {
        status.value = { did: store.did, exists: false, profileCompleted: false }
        checked.value = true
        return status.value
      }
      const data = await res.json()
      status.value = {
        did: data.did || store.did,
        exists: !!data.exists,
        profileCompleted: !!data.profileCompleted,
        identityType: data.identityType,
      }
    } catch {
      status.value = { did: store.did, exists: false, profileCompleted: false }
    } finally {
      loading.value = false
      checked.value = true
    }
    return status.value
  }

  /**
   * 清理无效的前端身份状态（DID 在数据库不存在时调用）
   */
  function clearInvalidIdentity() {
    store.clear()
    status.value = { did: null, exists: false, profileCompleted: false }
    checked.value = false
  }

  /**
   * 重置检查状态（切换 DID 时调用）
   */
  function resetStatus() {
    status.value = { did: null, exists: false, profileCompleted: false }
    checked.value = false
  }

  return {
    status,
    loading,
    checked,
    hasDid,
    isLoggedIn,
    isProfileCompleted,
    isIdentityExists,
    fetchStatus,
    clearInvalidIdentity,
    resetStatus,
  }
}
