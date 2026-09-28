<template>
  <div class="map-container" ref="mapRef">
    <div id="baidu-map" ref="mapInner"></div>
    <div class="map-overlay">
      <div class="network-scan" v-if="isScanning">
        <div class="scan-text glow-text">{{ scanText }}</div>
      </div>
    </div>
    <div class="agent-tooltip" v-if="hoveredAgent" :style="{ left: tooltipPos.x + 'px', top: tooltipPos.y + 'px' }">
      <div class="tooltip-header" :style="{ borderColor: hoveredAgent.color }">
        {{ hoveredAgent.name }}
      </div>
      <div class="tooltip-row">行业: {{ hoveredAgent.industry }}</div>
      <div class="tooltip-row">位置: {{ hoveredAgent.location.city }}商业节点</div>
      <div class="tooltip-row">目标: {{ hoveredAgent.goal }}</div>
      <div class="tooltip-row">状态: {{ statusText(hoveredAgent.status) }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface Agent {
  id: string
  name: string
  industry: string
  location: { city: string, lat: number, lng: number }
  goal: string
  status: string
  color: string
  partners: string[]
  search_trail: [number, number][]
}

const mapRef = ref<HTMLElement>()
const mapInner = ref<HTMLElement>()
const isScanning = ref(false)
const scanText = ref('')
const hoveredAgent = ref<Agent | null>(null)
const tooltipPos = ref({ x: 0, y: 0 })

let map: any = null
let BMap: any = null
const agentMarkers: Map<string, any> = new Map()
const trailLines: Map<string, any> = new Map()
const connectionLines: any[] = []
const scanCircles: any[] = []

const CITY_COORDS: Record<string, { lat: number, lng: number }> = {
  '北京': { lat: 39.90, lng: 116.40 },
  '上海': { lat: 31.23, lng: 121.47 },
  '广州': { lat: 23.13, lng: 113.26 },
  '深圳': { lat: 22.54, lng: 114.06 },
  '成都': { lat: 30.57, lng: 104.07 },
  '杭州': { lat: 30.27, lng: 120.15 },
  '武汉': { lat: 30.59, lng: 114.30 },
  '西安': { lat: 34.26, lng: 108.94 },
  '南京': { lat: 32.06, lng: 118.80 },
  '重庆': { lat: 29.56, lng: 106.55 },
  '昆明': { lat: 25.04, lng: 102.70 },
  '长沙': { lat: 28.23, lng: 112.94 },
  '郑州': { lat: 34.75, lng: 113.65 },
  '厦门': { lat: 24.48, lng: 118.09 },
  '苏州': { lat: 31.30, lng: 120.62 },
  '合肥': { lat: 31.82, lng: 117.23 },
  '济南': { lat: 36.65, lng: 116.99 },
  '福州': { lat: 26.07, lng: 119.30 },
  '贵阳': { lat: 26.65, lng: 106.63 },
  '南宁': { lat: 22.82, lng: 108.32 },
}

function getCityCoord(city: string) {
  return CITY_COORDS[city] || { lat: 30 + Math.random() * 10, lng: 110 + Math.random() * 10 }
}

function initMap() {
  if (!mapInner.value) return
  BMap = (window as any).BMap
  if (!BMap) {
    console.warn('百度地图未加载')
    return
  }

  map = new BMap.Map(mapInner.value, {
    enableMapClick: false,
    enableHighResolution: true
  })

  const point = new BMap.Point(110.0, 35.0)
  map.centerAndZoom(point, 5)

  map.setMapStyleV2({
    styleId: '9c6a25e95b3b0428676b32dcb8381d78'
  })

  map.enableScrollWheelZoom()
  map.disableDragging()
  map.disableDoubleClickZoom()
  map.disableKeyboard()
  map.disableInertialDragging()
  map.disablePinchToZoom()

  drawGridOverlay()
}

function drawGridOverlay() {
  if (!map || !BMap) return
  const points = []
  for (let lat = 18; lat <= 54; lat += 6) {
    for (let lng = 73; lng <= 135; lng += 6) {
      points.push(new BMap.Point(lng, lat))
    }
  }
  for (const p of points) {
    const marker = new BMap.Marker(p, {
      icon: new BMap.Icon('data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><circle cx="2" cy="2" r="1" fill="rgba(0,212,255,0.1)"/></svg>'
      ), new BMap.Size(4, 4))
    })
    map.addOverlay(marker)
  }
}

function addAgentMarker(agent: Agent) {
  if (!map || !BMap) return
  const coord = getCityCoord(agent.location.city)
  const point = new BMap.Point(coord.lng, coord.lat)
  agent.location.lat = coord.lat
  agent.location.lng = coord.lng

  const html = `
    <div class="agent-node" style="
      width: 36px; height: 36px; border-radius: 50%;
      background: radial-gradient(circle, ${agent.color}44 0%, transparent 70%);
      border: 2px solid ${agent.color};
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 0 15px ${agent.color}66;
      cursor: pointer;
      animation: pulse 2s ease-in-out infinite;
    ">
      <div style="width: 10px; height: 10px; border-radius: 50%; background: ${agent.color};"></div>
    </div>
    <div style="
      position: absolute; top: -22px; left: 50%; transform: translateX(-50%);
      white-space: nowrap; font-size: 11px; color: ${agent.color};
      text-shadow: 0 0 8px ${agent.color}88;
      font-family: 'PingFang SC', sans-serif;
      pointer-events: none;
    ">${agent.name}</div>
  `

  const label = new BMap.Label('', {
    position: point,
    offset: new BMap.Size(0, 0)
  })
  label.setContent(html)
  label.setStyle({ background: 'transparent', border: 'none', width: '60px', height: '60px' })

  label.addEventListener('mouseover', () => {
    hoveredAgent.value = agent
    tooltipPos.value = { x: 280 + 30, y: 100 }
  })
  label.addEventListener('mouseout', () => {
    hoveredAgent.value = null
  })

  map.addOverlay(label)
  agentMarkers.set(agent.id, { marker: label, point })
}

function statusText(status: string) {
  const map: Record<string, string> = {
    idle: '空闲', online: '在线', observing: '监听中',
    evaluating: '评估中', searching: '搜索中', connecting: '连接中',
    negotiating: '谈判中', cooperating: '合作中', learning: '学习中', evolving: '进化中'
  }
  return map[status] || status
}

onMounted(() => {
  const script = document.createElement('script')
  script.src = `https://api.map.baidu.com/api?v=3.0&ak=uehpltb8hcY0iTSIjoulmiuSFNl2upDP&callback=_baiduMapInit`
  ;(window as any)._baiduMapInit = () => {
    initMap()
  }
  document.head.appendChild(script)
})
</script>

<style scoped>
.map-container {
  width: 100%;
  height: 100%;
  position: relative;
}

#baidu-map {
  width: 100%;
  height: 100%;
}

.map-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 5;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 20px;
}

.network-scan {
  background: rgba(10, 14, 39, 0.85);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 12px 24px;
  animation: fadeIn 0.5s ease;
}

.scan-text {
  font-size: 14px;
  color: var(--color-primary);
  letter-spacing: 1px;
}

.agent-tooltip {
  position: absolute;
  z-index: 20;
  background: var(--bg-card);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 12px;
  min-width: 200px;
  pointer-events: none;
  animation: fadeIn 0.2s ease;
}

.tooltip-header {
  font-size: 14px;
  font-weight: 600;
  padding-bottom: 6px;
  margin-bottom: 6px;
  border-bottom: 2px solid;
}

.tooltip-row {
  font-size: 12px;
  color: var(--color-text-secondary);
  padding: 2px 0;
}
</style>
