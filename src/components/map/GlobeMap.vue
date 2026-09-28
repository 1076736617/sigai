<template>
  <div class="globe-container">
    <div ref="globeEl" class="globe-canvas"></div>
    <div v-if="selectedAgent" class="agent-popup" :style="{ left: popupPos.x + 'px', top: popupPos.y + 'px' }">
      <div class="popup-header" :style="{ borderColor: nodeColor(selectedAgent) }">
        {{ selectedAgent.name || 'AI Agent' }}
      </div>
      <div class="popup-row"><span class="lbl">DID</span><span class="val">{{ shortDid(selectedAgent.did) }}</span></div>
      <div class="popup-row"><span class="lbl">类型</span><span class="val">{{ typeLabel(selectedAgent.type) }}</span></div>
      <div class="popup-row"><span class="lbl">所在地</span><span class="val">{{ locationText(selectedAgent) }}</span></div>
      <div class="popup-row" v-if="selectedAgent.model"><span class="lbl">AI 模型</span><span class="val">{{ selectedAgent.model }}</span></div>
      <div class="popup-row" v-if="selectedAgent.capabilities?.length">
        <span class="lbl">AI 能力</span><span class="val">{{ selectedAgent.capabilities.join(' / ') }}</span>
      </div>
      <div class="popup-row"><span class="lbl">网络信誉</span><span class="val" style="color: var(--color-success)">{{ selectedAgent.reputation ?? 87 }}</span></div>
    </div>
    <!-- 我的身份信息浮窗（独立于拜访高亮 popup，不互相影响） -->
    <div v-if="selfInfoVisible && selfNode" class="self-info-popup">
      <div class="popup-header" :style="{ borderColor: '#00d4ff' }">
        {{ selfNode.name || '我的身份' }}
      </div>
      <div class="popup-row"><span class="lbl">DID</span><span class="val">{{ selfNode.did }}</span></div>
      <div class="popup-row"><span class="lbl">类型</span><span class="val">{{ typeLabel(selfNode.type) }}</span></div>
      <div class="popup-row"><span class="lbl">所在地</span><span class="val">{{ locationText(selfNode) }}</span></div>
      <div class="popup-row"><span class="lbl">网络信誉</span><span class="val" style="color: var(--color-success)">{{ selfNode.reputation ?? 87 }}</span></div>
      <div class="popup-row"><span class="lbl">匿名状态</span><span class="val"><span class="status-dot online"></span>已验证匿名节点</span></div>
      <div class="popup-row" v-if="selfNode.model"><span class="lbl">AI 能力</span><span class="val">{{ selfNode.model }}</span></div>
      <div class="popup-row" v-if="selfNode.capabilities?.length">
        <span class="lbl">详细信息</span><span class="val">{{ selfNode.capabilities.join(' / ') }}</span>
      </div>
      <button class="popup-close" @click="selfInfoVisible = false">✕ 关闭</button>
    </div>
    <div class="globe-legend">
      <div class="legend-item"><span class="dot provider"></span>商家</div>
      <div class="legend-item"><span class="dot ai"></span>AI Identity</div>
      <div class="legend-item"><span class="dot consumer"></span>用户</div>
      <div class="legend-item"><span class="dot self"></span>当前身份</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import Globe from 'globe.gl'
import * as THREE from 'three'
import type { GlobeInstance } from 'globe.gl'
import { useDidStore } from '../../stores/did'
import type { AgentMapNode, MapLocation } from '../../config/map'
import { locationToCoordinates } from '../../services/map/locationToCoordinates'

interface ArcDatum {
  startLat: number
  startLng: number
  endLat: number
  endLng: number
  color: string
  status: string
  arcDashLength: number
  arcDashGap: number
  arcDashAnimateTime: number
}

interface RingDatum {
  lat: number
  lng: number
  maxR: number
  propagationSpeed: number
  repeatPeriod: number
}

const store = useDidStore()
const globeEl = ref<HTMLElement>()
const selectedAgent = ref<AgentMapNode | null>(null)
const popupPos = ref({ x: 0, y: 0 })
const selfInfoVisible = ref(false)
const selfNode = ref<AgentMapNode | null>(null)

let globe: GlobeInstance | null = null
let resizeObserver: ResizeObserver | null = null
let nodes: AgentMapNode[] = []
let baseRings: RingDatum[] = []
const MAX_POINTS = 500
const MAX_ARCS = 200
const MAX_RINGS = 100

const ARCS_COLOR: Record<string, string> = {
  matching: '#3b82f6',
  chatting: '#22d3ee',
  waiting_online: '#facc15',
  negotiating: '#facc15',
  pending_confirmation: '#facc15',
  confirmed: '#22c55e',
  completed: '#22c55e',
  rejected: '#ef4444',
}

function shortDid(did: string): string {
  if (!did) return '—'
  return did.length > 24 ? `${did.slice(0, 12)}…${did.slice(-8)}` : did
}

function typeLabel(type: string): string {
  if (type === 'provider') return '🏪 商家'
  if (type === 'consumer') return '👤 用户'
  if (type === 'ai_identity') return '🤖 AI Identity'
  return type || '—'
}

function locationText(a: AgentMapNode): string {
  const parts = [a.location?.country, a.location?.province, a.location?.city].filter(Boolean)
  return parts.length ? parts.join(' / ') : '未设置'
}

function nodeColor(a: AgentMapNode): string {
  if (a.isSelf) return '#00d4ff'
  if (a.type === 'provider') return '#22c55e'
  if (a.type === 'ai_identity') return '#a78bfa'
  return '#3b82f6'
}

async function fetchLocation(did: string): Promise<MapLocation | null> {
  try {
    const r = await fetch(`/api/did/location?did=${encodeURIComponent(did)}`)
    if (r.ok) {
      const j = await r.json()
      if (j.success && j.has_location && j.data) return j.data
    }
  } catch {}
  return null
}

async function fetchAgentInfo(did: string): Promise<{ name?: string, model?: string, capabilities?: string[] }> {
  try {
    const r = await fetch(`/api/agent/${encodeURIComponent(did)}`)
    if (r.ok) {
      const j = await r.json()
      if (j.success && j.has_agent && j.data) {
        const d = j.data
        return { name: d.name, model: d.ai_config?.model || d.model || '', capabilities: d.profile?.tags || [] }
      }
    }
  } catch {}
  return {}
}

async function loadAgents() {
  const seen = new Map<string, AgentMapNode>()
  const addNode = async (did: string, type: string, isSelf: boolean, info: { name?: string, model?: string, capabilities?: string[] }) => {
    if (!did || seen.has(did)) return
    const loc = await fetchLocation(did)
    const coord = locationToCoordinates(loc)
    if (!coord) return
    seen.set(did, {
      did,
      name: info.name || shortDid(did),
      type,
      location: loc || {},
      lat: coord.lat,
      lng: coord.lng,
      model: info.model || '',
      capabilities: info.capabilities || [],
      reputation: 87,
      isSelf,
    })
  }

  // 当前用户
  const selfType = store.identityType || 'consumer'
  const selfInfo = await fetchAgentInfo(store.did)
  await addNode(store.did, selfType, true, selfInfo)

  // 所有商家
  try {
    const r = await fetch('/api/profile/list/providers')
    if (r.ok) {
      const j = await r.json()
      const providers = Array.isArray(j.data) ? j.data : []
      const batch = providers.slice(0, 50)
      for (const p of batch) {
        await addNode(p.did, 'provider', p.did === store.did, { name: p.category || p.did })
      }
    }
  } catch {}

  nodes = Array.from(seen.values())
  applyPoints()
  await loadArcs()
}

async function loadArcs() {
  if (!store.did) return
  const arcs: ArcDatum[] = []
  const rings: RingDatum[] = []
  try {
    const r = await fetch(`/api/conversations/list?did=${encodeURIComponent(store.did)}`)
    if (r.ok) {
      const j = await r.json()
      const convs = Array.isArray(j.data) ? j.data : []
      for (const c of convs.slice(0, MAX_ARCS)) {
        const a = nodes.find(n => n.did === c.consumer_did)
        const b = nodes.find(n => n.did === c.provider_did)
        if (a && b) {
          const color = ARCS_COLOR[c.status] || ARCS_COLOR.chatting
          arcs.push({
            startLat: a.lat, startLng: a.lng, endLat: b.lat, endLng: b.lng,
            color, status: c.status || 'chatting',
            arcDashLength: 0.4, arcDashGap: 1.2, arcDashAnimateTime: 1600,
          })
        }
      }
    }
  } catch {}

  // 当前用户脉冲 Ring
  const selfNode = nodes.find(n => n.isSelf)
  if (selfNode) {
    rings.push({ lat: selfNode.lat, lng: selfNode.lng, maxR: 5, propagationSpeed: 2.5, repeatPeriod: 1000 })
  }
  baseRings = rings

  if (globe) {
    globe.arcsData(arcs)
    globe.ringsData(rings)
    ;(window as any).__globeDebug = { _points: nodes.length, _arcs: arcs.length, _rings: rings.length, _globe: globe }
  }
}

function applyPoints() {
  if (!globe) return
  const pts = nodes.slice(0, MAX_POINTS).map(n => ({
    lat: n.lat,
    lng: n.lng,
    radius: n.isSelf ? 0.55 : (n.type === 'provider' ? 0.42 : 0.34),
    color: nodeColor(n),
    altitude: 0.01,
    agent: n,
  }))
  globe.pointsData(pts)
    .pointAltitude('altitude')
    .pointRadius('radius')
    .pointColor('color')
    .pointsMerge(false)
    .pointLabel(p => `<div style="font-size:12px;color:#00d4ff;text-shadow:0 0 6px #00d4ff88;padding:2px 8px;white-space:nowrap">${(p as any).agent?.name || 'AI Agent'}</div>`)
}

function initGlobe() {
  if (!globeEl.value) return
  globe = Globe()(globeEl.value)
    .globeImageUrl('/globe/earth-blue-marble.jpg')
    .bumpImageUrl('/globe/earth-topology.png')
    .backgroundImageUrl('/globe/night-sky.png')
    .backgroundColor('rgba(2,4,9,0)')
    .showAtmosphere(true)
    .atmosphereColor('#00d9ff')
    .atmosphereAltitude(0.18)

  // 真实地球仪：蓝纹地球贴图 + 适度凹凸，让海洋/陆地/云层有层次感。
  // globe.gl 在贴图加载完成后会把材质 color 置为 null（导致贴图偏黑），
  // 这里在贴图加载后补一次白色 color，让真实贴图颜色正常显示。
  const applyGlobeMaterialFix = () => {
    const mat = globe?.globeMaterial() as any
    if (!mat || !mat.map || !mat.map.image) return
    mat.bumpScale = 1.2
    try {
      mat.color = new THREE.Color(0xffffff)
      mat.needsUpdate = true
    } catch {}
  }
  applyGlobeMaterialFix()
  // 贴图异步加载完成后补一次（globe.gl 加载完成会重置 color=null）
  const t = setInterval(() => {
    const mat = globe?.globeMaterial() as any
    if (mat && mat.map && mat.map.image) {
      applyGlobeMaterialFix()
      clearInterval(t)
    }
  }, 300)

  globe.arcsData([])
    .arcColor('color')
    .arcAltitude(0.22)
    .arcStroke(0.35)
    .arcDashLength('arcDashLength')
    .arcDashGap('arcDashGap')
    .arcDashAnimateTime('arcDashAnimateTime')

  globe.ringsData([])
    .ringColor(() => (t: number) => `rgba(0,212,255,${1 - t})`)
    .ringMaxRadius('maxR')
    .ringPropagationSpeed('propagationSpeed')
    .ringRepeatPeriod('repeatPeriod')

  globe.onPointClick((point: any) => {
    console.log('[GLOBE] onPointClick', point?.agent?.name)
    const agent = point.agent as AgentMapNode
    if (agent) {
      selectedAgent.value = agent
      popupPos.value = { x: 40, y: 40 }
    }
  })
  globe.onGlobeClick(() => {
    selectedAgent.value = null
  })

  const controls = globe.controls()
  controls.autoRotate = true
  controls.autoRotateSpeed = 0.4
  controls.enableDamping = true
  controls.dampingFactor = 0.06

  // 用户手动拖动时暂停自动旋转，停止后恢复
  controls.addEventListener('start', () => { controls.autoRotate = false })
  controls.addEventListener('end', () => {
    setTimeout(() => { if (globe) (globe!.controls() as any).autoRotate = true }, 3000)
  })

  globe.pointOfView({ lat: 30, lng: 105, altitude: 2.2 }, 0)

  resizeObserver = new ResizeObserver(() => {
    if (globe && globeEl.value) {
      globe.width(globeEl.value.clientWidth)
      globe.height(globeEl.value.clientHeight)
    }
  })
  if (globeEl.value) resizeObserver.observe(globeEl.value)
}

function destroyGlobe() {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (globe) {
    try { (globe as any)._destructor() } catch {}
    globe = null
  }
}

// ─── 拜访联动：对外暴露高亮接口（供 VisitPanel 调用，纯视觉，不影响核心逻辑）───
let highlightRings: RingDatum[] = []
let highlightNode: AgentMapNode | null = null

function _refreshHighlightView(clear: boolean) {
  if (!globe) return
  if (clear) {
    highlightNode = null
  }
  let pts = nodes.slice(0, MAX_POINTS).map(n => ({
    lat: n.lat, lng: n.lng,
    radius: n.isSelf ? 0.55 : (n.type === 'provider' ? 0.42 : 0.34),
    color: nodeColor(n), altitude: 0.01, agent: n,
  }))
  if (highlightNode) {
    pts.push({
      lat: highlightNode.lat, lng: highlightNode.lng,
      radius: 0.5, color: '#00d4ff', altitude: 0.01, agent: highlightNode,
    })
  }
  globe.pointsData(pts)
    .pointAltitude('altitude')
    .pointRadius('radius')
    .pointColor('color')
    .pointsMerge(false)
    .pointLabel((p: any) => `<div style="font-size:12px;color:#00d4ff;text-shadow:0 0 6px #00d4ff88;padding:2px 8px;white-space:nowrap">${p.agent?.name || 'AI Agent'}</div>`)
}

async function highlightAgent(did: string) {
  if (!globe) return
  let node = nodes.find(n => n.did === did)
  // 目标节点可能不在当前加载集合（例如仅在地图加载后才拜访的用户）
  if (!node) {
    const loc = await fetchLocation(did)
    const coord = locationToCoordinates(loc)
    if (!coord) return
    const info = await fetchAgentInfo(did)
    node = {
      did,
      name: info.name || shortDid(did),
      type: 'ai_identity',
      location: loc || {},
      lat: coord.lat,
      lng: coord.lng,
      model: info.model || '',
      capabilities: info.capabilities || [],
      reputation: 87,
    }
    highlightNode = node
  }
  // 1. 相机定位到目标
  globe.pointOfView({ lat: node.lat, lng: node.lng, altitude: 1.6 }, 1200)
  // 2. 目标节点脉冲 Ring（拜访中高亮）
  highlightRings = [
    { lat: node.lat, lng: node.lng, maxR: 8, propagationSpeed: 2, repeatPeriod: 900 },
  ]
  globe.ringsData([...baseRings, ...highlightRings])
  // 3. 弹出该 AI 的画像 popup
  selectedAgent.value = node
  popupPos.value = { x: 60, y: 60 }
  _refreshHighlightView(false)
  // 4. 几秒后清除拜访脉冲，恢复自身脉冲
  setTimeout(() => {
    if (!globe) return
    highlightRings = []
    globe.ringsData(baseRings)
    _refreshHighlightView(true)
  }, 4000)
}

// ─── 我的身份信息：在地图上浮窗展示（独立于拜访高亮，不影响拜访用户信息）───
function showSelfInfo() {
  if (!globe) return
  const self = nodes.find(n => n.isSelf)
  if (!self) return
  selfNode.value = self
  selfInfoVisible.value = true
  globe.pointOfView({ lat: self.lat, lng: self.lng, altitude: 1.6 }, 1200)
}

function registerGlobeApi() {
  ;(window as any).__globeApi = { highlight: highlightAgent, showSelfInfo }
}

function unregisterGlobeApi() {
  if ((window as any).__globeApi?.highlight === highlightAgent) {
    ;(window as any).__globeApi = undefined
  }
}

onMounted(async () => {
  initGlobe()
  await loadAgents()
  registerGlobeApi()
})

onBeforeUnmount(() => {
  unregisterGlobeApi()
  destroyGlobe()
})
</script>

<style scoped>
.globe-container {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  background: #020409;
}
.globe-canvas {
  width: 100%;
  height: 100%;
}
.globe-canvas canvas {
  display: block;
}
.agent-popup {
  position: absolute;
  z-index: 30;
  background: rgba(12, 16, 26, 0.92);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 12px 14px;
  min-width: 220px;
  pointer-events: auto;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(6px);
}
.self-info-popup {
  position: absolute;
  top: 60px;
  right: 16px;
  z-index: 30;
  background: rgba(12, 16, 26, 0.92);
  border: 1px solid rgba(0, 212, 255, 0.35);
  border-radius: 10px;
  padding: 12px 14px;
  min-width: 240px;
  pointer-events: auto;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(6px);
}
.popup-close {
  margin-top: 8px;
  width: 100%;
  padding: 5px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-secondary);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}
.popup-close:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.popup-header {
  font-size: 14px;
  font-weight: 700;
  padding-bottom: 6px;
  margin-bottom: 8px;
  border-bottom: 2px solid;
  color: var(--color-text);
}
.popup-row {
  display: flex;
  gap: 6px;
  font-size: 12px;
  padding: 2px 0;
  align-items: baseline;
}
.popup-row .lbl {
  color: var(--color-text-secondary);
  min-width: 52px;
  flex-shrink: 0;
}
.popup-row .val {
  color: var(--color-text);
  word-break: break-all;
}
.globe-legend {
  position: absolute;
  bottom: 14px;
  left: 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px;
  background: rgba(10, 14, 26, 0.6);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 11px;
  color: var(--color-text-secondary);
  pointer-events: none;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.legend-item .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.dot.provider { background: #22c55e; box-shadow: 0 0 6px #22c55e; }
.dot.ai { background: #a78bfa; box-shadow: 0 0 6px #a78bfa; }
.dot.consumer { background: #3b82f6; box-shadow: 0 0 6px #3b82f6; }
.dot.self { background: #00d4ff; box-shadow: 0 0 8px #00d4ff; }
</style>
