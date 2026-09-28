<template>
  <component :is="current" />
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import BaiduMap from './BaiduMap.vue'
import { isGlobeMode } from '../../services/map/mapProvider'

const GlobeMap = defineAsyncComponent(() => import('./GlobeMap.vue'))

const current = computed(() => (isGlobeMode() ? GlobeMap : BaiduMap))
</script>
