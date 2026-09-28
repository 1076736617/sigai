import { createRouter, createWebHashHistory } from 'vue-router'
import IdentitySelect from '../views/IdentitySelect.vue'
import DidLogin from '../views/DidLogin.vue'
import MainConsole from '../views/MainConsole.vue'
import AiSettings from '../views/AiSettings.vue'
import AgentCreate from '../views/AgentCreate.vue'
import ProfileInterview from '../views/ProfileInterview.vue'

const routes = [
  { path: '/', name: 'select', component: IdentitySelect },
  { path: '/login', name: 'login', component: DidLogin },
  {
    path: '/main',
    name: 'main',
    component: MainConsole,
    meta: { requiresIdentityProfile: true },
  },
  { path: '/settings/ai', name: 'ai-settings', component: AiSettings },
  { path: '/agent/create', name: 'agent-create', component: AgentCreate },
  { path: '/profile/interview', name: 'profile-interview', component: ProfileInterview },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

let identityGuardRunning = false

router.beforeEach(async (to) => {
  if (identityGuardRunning) return true

  const needsProfile = to.matched.some(r => r.meta?.requiresIdentityProfile)
  if (!needsProfile) return true

  const raw = localStorage.getItem('aibs_did')
  let did = ''
  try {
    did = raw ? JSON.parse(raw).did || '' : ''
  } catch {
    did = ''
  }

  console.log('[ROUTER GUARD] navigating to', to.path, 'did=', did)

  if (!did) {
    console.log('[ROUTER GUARD] no DID, redirecting to /')
    return { name: 'select' }
  }

  identityGuardRunning = true
  try {
    const res = await fetch(`/api/did/status?did=${encodeURIComponent(did)}`)
    if (!res.ok) {
      console.log('[ROUTER GUARD] status request failed:', res.status)
      localStorage.removeItem('aibs_did')
      return { name: 'select' }
    }
    const data = await res.json()
    console.log('[ROUTER GUARD] status response:', data)

    if (!data.exists) {
      console.log('[ROUTER GUARD] DID not found in DB, clearing and redirecting to /')
      localStorage.removeItem('aibs_did')
      return { name: 'select' }
    }

    if (!data.profileCompleted) {
      console.log('[ROUTER GUARD] profile not completed, redirecting to /profile/interview')
      return { name: 'profile-interview' }
    }

    console.log('[ROUTER GUARD] all checks passed, allowing navigation to', to.path)
    return true
  } catch (e) {
    console.log('[ROUTER GUARD] error, allowing navigation:', e)
    return true
  } finally {
    identityGuardRunning = false
  }
})

export default router
