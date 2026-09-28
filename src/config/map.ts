/**
 * 地图渲染模式配置。
 *
 * 切换地图视觉层只需要修改这一个常量：
 *   'globe' → 3D 地球（默认）
 *   'baidu' → 原百度地图
 */
export type MapRenderMode = 'globe' | 'baidu'

export const MAP_RENDER_MODE: MapRenderMode = 'globe'

/** 地图数据与视觉层相关的类型定义。 */
export interface MapLocation {
  country?: string
  province?: string
  city?: string
}

export interface AgentMapNode {
  did: string
  name: string
  type: string
  location: MapLocation
  lat: number
  lng: number
  model?: string
  capabilities?: string[]
  reputation?: number
  isSelf?: boolean
}
