import { MAP_RENDER_MODE, type MapRenderMode } from '../../config/map'

/**
 * 地图 Provider 工厂。
 *
 * 由 MapView / MapFactory 负责选择渲染器，业务代码不感知具体实现。
 * 切换渲染模式只改 config/map.ts 中的 MAP_RENDER_MODE 即可。
 */
export function getMapRenderMode(): MapRenderMode {
  return MAP_RENDER_MODE
}

export function isGlobeMode(): boolean {
  return MAP_RENDER_MODE === 'globe'
}

export function isBaiduMode(): boolean {
  return MAP_RENDER_MODE === 'baidu'
}
