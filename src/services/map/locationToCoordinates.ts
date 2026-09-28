import type { MapLocation } from '../../config/map'

/**
 * 把「国家/省/市」文本转换为经纬度。
 *
 * 复用 AICommerceMap 中原有的城市坐标表（CITY_COORDS），
 * 并补充省份默认坐标与常见城市，避免依赖外部地理编码服务。
 * 传入结构不变（country/province/city），不改动身份数据结构。
 */

const CITY_COORDS: Record<string, { lat: number, lng: number }> = {
  '北京': { lat: 39.90, lng: 116.40 },
  '北京市': { lat: 39.90, lng: 116.40 },
  '上海': { lat: 31.23, lng: 121.47 },
  '上海市': { lat: 31.23, lng: 121.47 },
  '广州': { lat: 23.13, lng: 113.26 },
  '广州市': { lat: 23.13, lng: 113.26 },
  '深圳': { lat: 22.54, lng: 114.06 },
  '深圳市': { lat: 22.54, lng: 114.06 },
  '成都': { lat: 30.57, lng: 104.07 },
  '成都市': { lat: 30.57, lng: 104.07 },
  '杭州': { lat: 30.27, lng: 120.15 },
  '杭州市': { lat: 30.27, lng: 120.15 },
  '武汉': { lat: 30.59, lng: 114.30 },
  '武汉市': { lat: 30.59, lng: 114.30 },
  '西安': { lat: 34.26, lng: 108.94 },
  '西安市': { lat: 34.26, lng: 108.94 },
  '南京': { lat: 32.06, lng: 118.80 },
  '南京市': { lat: 32.06, lng: 118.80 },
  '重庆': { lat: 29.56, lng: 106.55 },
  '重庆市': { lat: 29.56, lng: 106.55 },
  '昆明': { lat: 25.04, lng: 102.70 },
  '昆明市': { lat: 25.04, lng: 102.70 },
  '长沙': { lat: 28.23, lng: 112.94 },
  '长沙市': { lat: 28.23, lng: 112.94 },
  '郑州': { lat: 34.75, lng: 113.65 },
  '郑州市': { lat: 34.75, lng: 113.65 },
  '厦门': { lat: 24.48, lng: 118.09 },
  '厦门市': { lat: 24.48, lng: 118.09 },
  '苏州': { lat: 31.30, lng: 120.62 },
  '苏州市': { lat: 31.30, lng: 120.62 },
  '合肥': { lat: 31.82, lng: 117.23 },
  '合肥市': { lat: 31.82, lng: 117.23 },
  '济南': { lat: 36.65, lng: 116.99 },
  '济南市': { lat: 36.65, lng: 116.99 },
  '福州': { lat: 26.07, lng: 119.30 },
  '福州市': { lat: 26.07, lng: 119.30 },
  '贵阳': { lat: 26.65, lng: 106.63 },
  '贵阳市': { lat: 26.65, lng: 106.63 },
  '南宁': { lat: 22.82, lng: 108.32 },
  '南宁市': { lat: 22.82, lng: 108.32 },
  '天津': { lat: 39.08, lng: 117.20 },
  '天津市': { lat: 39.08, lng: 117.20 },
  '沈阳': { lat: 41.80, lng: 123.43 },
  '沈阳市': { lat: 41.80, lng: 123.43 },
  '大连': { lat: 38.91, lng: 121.61 },
  '大连市': { lat: 38.91, lng: 121.61 },
  '青岛': { lat: 36.07, lng: 120.38 },
  '青岛市': { lat: 36.07, lng: 120.38 },
  '石家庄': { lat: 38.04, lng: 114.51 },
  '石家庄市': { lat: 38.04, lng: 114.51 },
  '太原': { lat: 37.87, lng: 112.55 },
  '太原市': { lat: 37.87, lng: 112.55 },
  '哈尔滨': { lat: 45.80, lng: 126.53 },
  '哈尔滨市': { lat: 45.80, lng: 126.53 },
  '长春': { lat: 43.82, lng: 125.32 },
  '长春市': { lat: 43.82, lng: 125.32 },
  '南昌': { lat: 28.68, lng: 115.86 },
  '南昌市': { lat: 28.68, lng: 115.86 },
  '宁波': { lat: 29.87, lng: 121.54 },
  '宁波市': { lat: 29.87, lng: 121.54 },
  '温州': { lat: 28.00, lng: 120.70 },
  '温州市': { lat: 28.00, lng: 120.70 },
  '海口': { lat: 20.04, lng: 110.32 },
  '海口市': { lat: 20.04, lng: 110.32 },
  '兰州': { lat: 36.06, lng: 103.83 },
  '兰州市': { lat: 36.06, lng: 103.83 },
  '乌鲁木齐': { lat: 43.83, lng: 87.62 },
  '乌鲁木齐市': { lat: 43.83, lng: 87.62 },
  '呼和浩特': { lat: 40.84, lng: 111.75 },
  '呼和浩特市': { lat: 40.84, lng: 111.75 },
  '西宁': { lat: 36.62, lng: 101.78 },
  '西宁市': { lat: 36.62, lng: 101.78 },
  '银川': { lat: 38.49, lng: 106.23 },
  '银川市': { lat: 38.49, lng: 106.23 },
  '拉萨': { lat: 29.65, lng: 91.14 },
  '拉萨市': { lat: 29.65, lng: 91.14 },
  '香港': { lat: 22.32, lng: 114.17 },
  '澳门': { lat: 22.20, lng: 113.55 },
  '台北': { lat: 25.03, lng: 121.56 },
  '台北市': { lat: 25.03, lng: 121.56 },
}

/** 省级默认坐标（直辖市/自治区/省）。 */
const PROVINCE_COORDS: Record<string, { lat: number, lng: number }> = {
  '北京市': { lat: 39.90, lng: 116.40 },
  '上海市': { lat: 31.23, lng: 121.47 },
  '天津市': { lat: 39.08, lng: 117.20 },
  '重庆市': { lat: 29.56, lng: 106.55 },
  '广东省': { lat: 23.13, lng: 113.26 },
  '浙江省': { lat: 30.27, lng: 120.15 },
  '江苏省': { lat: 32.06, lng: 118.80 },
  '福建省': { lat: 26.07, lng: 119.30 },
  '四川省': { lat: 30.57, lng: 104.07 },
  '湖北省': { lat: 30.59, lng: 114.30 },
  '湖南省': { lat: 28.23, lng: 112.94 },
  '山东省': { lat: 36.65, lng: 116.99 },
  '辽宁省': { lat: 41.80, lng: 123.43 },
  '陕西省': { lat: 34.26, lng: 108.94 },
  '云南省': { lat: 25.04, lng: 102.70 },
  '广西壮族自治区': { lat: 22.82, lng: 108.32 },
  '河北省': { lat: 38.04, lng: 114.51 },
  '山西省': { lat: 37.87, lng: 112.55 },
  '黑龙江省': { lat: 45.80, lng: 126.53 },
  '吉林省': { lat: 43.82, lng: 125.32 },
  '江西省': { lat: 28.68, lng: 115.86 },
  '安徽省': { lat: 31.82, lng: 117.23 },
  '河南省': { lat: 34.75, lng: 113.65 },
  '海南省': { lat: 20.04, lng: 110.32 },
  '甘肃省': { lat: 36.06, lng: 103.83 },
  '新疆维吾尔自治区': { lat: 43.83, lng: 87.62 },
  '内蒙古自治区': { lat: 40.84, lng: 111.75 },
  '青海省': { lat: 36.62, lng: 101.78 },
  '宁夏回族自治区': { lat: 38.49, lng: 106.23 },
  '西藏自治区': { lat: 29.65, lng: 91.14 },
  '香港特别行政区': { lat: 22.32, lng: 114.17 },
  '澳门特别行政区': { lat: 22.20, lng: 113.55 },
  '台湾省': { lat: 25.03, lng: 121.56 },
}

/** 中国外常见国家默认坐标（演示用，不替代真实数据）。 */
const COUNTRY_COORDS: Record<string, { lat: number, lng: number }> = {
  '中国': { lat: 35.86, lng: 104.19 },
}

export function locationToCoordinates(loc: MapLocation | null | undefined): { lat: number, lng: number } | null {
  if (!loc) return null

  const city = (loc.city || '').trim().replace(/市$/, '')
  const province = (loc.province || '').trim()
  const country = (loc.country || '').trim()

  if (city && CITY_COORDS[city]) return CITY_COORDS[city]
  if (city && CITY_COORDS[city + '市']) return CITY_COORDS[city + '市']
  if (province && PROVINCE_COORDS[province]) return PROVINCE_COORDS[province]
  if (country && COUNTRY_COORDS[country]) return COUNTRY_COORDS[country]
  return null
}
