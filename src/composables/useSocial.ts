import { computed, reactive, ref } from 'vue'

/**
 * 拜访 / 收藏 共享状态（模块级单例）。
 * 收藏状态必须持久化到后端 user_favorites 表；
 * 这里只缓存「当前 DID 已收藏哪些目标 DID」，保证拜访/收藏两个页面状态一致。
 *
 * 拜访列表是「持续增长的发现队列」，不是一次性任务：
 *  - allDiscoveredUsers：已经发现过的全部用户（只增不减，按 DID 去重）
 *  - visitedCount：     已经完成拜访的用户数（列表前缀，[0, visitedCount) 已拜访）
 *  - pendingUsers：     [visitedCount, length) 尚未拜访
 *  - currentIndex：     用户当前浏览位置，永远不被自动拜访抢占
 * 该状态放在模块级，切换 Tab 后不丢失、不重置、不从头再来。
 */

const favoriteDids = reactive(new Set<string>())
const favoritesLoaded = ref(false)

function isFavorite(targetDid: string): boolean {
  return favoriteDids.has(targetDid)
}

async function loadFavorites(userDid: string): Promise<void> {
  if (!userDid) return
  try {
    const r = await fetch(`/api/social/favorites?did=${encodeURIComponent(userDid)}`)
    if (r.ok) {
      const j = await r.json()
      if (j.success && Array.isArray(j.data)) {
        favoriteDids.clear()
        for (const f of j.data) {
          if (f.did) favoriteDids.add(f.did)
        }
        favoritesLoaded.value = true
      }
    }
  } catch {}
}

async function toggleFavorite(userDid: string, targetDid: string): Promise<boolean> {
  if (!userDid || !targetDid) return false
  const currentlyFav = isFavorite(targetDid)
  const url = currentlyFav ? '/api/social/unfavorite' : '/api/social/favorite'
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_did: userDid, target_did: targetDid }),
    })
    const j = await r.json()
    if (j.success) {
      if (currentlyFav) {
        favoriteDids.delete(targetDid)
      } else {
        favoriteDids.add(targetDid)
      }
      return true
    }
  } catch {}
  return false
}

async function unfavorite(userDid: string, targetDid: string): Promise<boolean> {
  if (!userDid || !targetDid) return false
  try {
    const r = await fetch('/api/social/unfavorite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_did: userDid, target_did: targetDid }),
    })
    const j = await r.json()
    if (j.success) {
      favoriteDids.delete(targetDid)
      return true
    }
  } catch {}
  return false
}

/** 打开/创建与目标 AI 的直接会话（复用现有 Conversation 系统，不重复创建）。 */
async function openDirectChat(
  userDid: string,
  targetDid: string,
  user_name = '我',
  target_name = 'AI'
): Promise<{ conversation_id: string; created?: boolean } | null> {
  if (!userDid || !targetDid) return null
  try {
    const r = await fetch('/api/conversations/direct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_did: userDid, target_did: targetDid, user_name, target_name }),
    })
    const j = await r.json()
    if (j.success && j.data) return j.data
  } catch {}
  return null
}

// ─────────────────────────────────────────────────────────────
// 拜访：持续增长的 AI 发现列表（只追加不重置，旧数据永不消失）
// ─────────────────────────────────────────────────────────────

const visitDid = ref('')
const allDiscoveredUsers = ref<any[]>([])
const visitedCount = ref(0)
const currentIndex = ref(0)
/** 用户浏览期间新发现的 AI 数量（只用于提示，不驱动跳转） */
const newDiscoveryCount = ref(0)

const totalCount = computed(() => allDiscoveredUsers.value.length)
const pendingCount = computed(() => Math.max(0, allDiscoveredUsers.value.length - visitedCount.value))
const visitedUsers = computed(() => allDiscoveredUsers.value.slice(0, visitedCount.value))
const pendingUsers = computed(() => allDiscoveredUsers.value.slice(visitedCount.value))
const currentUser = computed(() => allDiscoveredUsers.value[currentIndex.value] || null)

async function fetchIdentities(did: string): Promise<any[]> {
  try {
    const r = await fetch(`/api/social/identities?did=${encodeURIComponent(did)}`)
    if (r.ok) {
      const j = await r.json()
      if (j.success && Array.isArray(j.data)) return j.data
    }
  } catch {}
  return []
}

/** 会话切换时重置拜访状态（换用户登录不沿用上一个用户的列表）。 */
function ensureVisitSession(did: string) {
  if (visitDid.value !== did) {
    visitDid.value = did
    allDiscoveredUsers.value = []
    visitedCount.value = 0
    currentIndex.value = 0
    newDiscoveryCount.value = 0
  }
}

/**
 * 拉取数据库最新用户并【追加】到现有列表。
 * 只做：发现新 DID → 追加 → 更新总数 → 进入 pending。
 * 绝不：清空 / 重置 currentIndex / 自动开始拜访。
 * 返回新增数量。
 */
async function syncVisitUsers(did: string, countAsNew = true): Promise<number> {
  const users = await fetchIdentities(did)
  const existing = new Set(allDiscoveredUsers.value.map(u => u?.did))
  let added = 0
  for (const u of users) {
    if (u?.did && !existing.has(u.did)) {
      existing.add(u.did)
      allDiscoveredUsers.value.push(u)
      added++
    }
  }
  if (added > 0 && countAsNew) newDiscoveryCount.value += added
  return added
}

/** 清零「新发现」提示计数（用户点继续拜访 / 手动进入 pending 区域时调用）。 */
function clearNewDiscovery() {
  newDiscoveryCount.value = 0
}

/** 标记 [0, toIndex] 已拜访（visitedCount 只增不减）。 */
function markVisited(toIndex: number) {
  if (toIndex + 1 > visitedCount.value) visitedCount.value = toIndex + 1
}

export function useSocial() {
  return {
    favoriteDids,
    favoritesLoaded,
    isFavorite,
    loadFavorites,
    toggleFavorite,
    unfavorite,
    openDirectChat,
    // 拜访状态（模块级，跨 Tab 存活）
    visitDid,
    allDiscoveredUsers,
    visitedCount,
    currentIndex,
    totalCount,
    pendingCount,
    visitedUsers,
    pendingUsers,
    currentUser,
    ensureVisitSession,
    syncVisitUsers,
    markVisited,
    newDiscoveryCount,
    clearNewDiscovery,
  }
}