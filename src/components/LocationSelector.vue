<template>
  <div class="location-selector">
    <label>所在地</label>
    <div class="cascade-row">
      <select v-model="selectedCountry" class="loc-select" :disabled="true">
        <option :value="CHINA_COUNTRY">{{ CHINA_COUNTRY }}</option>
      </select>

      <select v-model="selectedProvince" class="loc-select" :disabled="!selectedCountry" @change="onProvinceChange">
        <option value="">选择省份</option>
        <option v-for="p in CHINA_PROVINCES" :key="p.code" :value="p.code">{{ p.name }}</option>
      </select>

      <select v-model="selectedCity" class="loc-select" :disabled="!cities.length">
        <option value="">选择城市</option>
        <option v-for="c in cities" :key="c.code" :value="c.code">{{ c.name }}</option>
      </select>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { CHINA_COUNTRY, CHINA_PROVINCES, getCityName, getProvinceName, getCitiesByProvince, type ChinaRegion } from '../data/chinaRegions'

const emit = defineEmits<{ (e: 'update', loc: { country: string; province: string; city: string }): void }>()

const selectedCountry = ref<string>(CHINA_COUNTRY)
const selectedProvince = ref('')
const selectedCity = ref('')
const cities = ref<ChinaRegion[]>([])

function onProvinceChange() {
  selectedCity.value = ''
  cities.value = selectedProvince.value ? getCitiesByProvince(selectedProvince.value) : []
  emitChange()
}

function emitChange() {
  emit('update', {
    country: selectedCountry.value,
    province: getProvinceName(selectedProvince.value),
    city: getCityName(selectedProvince.value, selectedCity.value),
  })
}

watch(selectedCity, () => {
  if (selectedCity.value) emitChange()
})
</script>

<style scoped>
.location-selector { margin-bottom: 14px; }
.location-selector label {
  display: block; font-size: 12px; color: var(--color-text-secondary);
  margin-bottom: 6px;
}
.cascade-row { display: flex; gap: 6px; }
.loc-select {
  flex: 1;
  background: rgba(0,0,0,0.3);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 10px 8px;
  color: var(--color-text);
  font-size: 13px;
  outline: none;
  appearance: none;
  cursor: pointer;
  min-width: 0;
}
.loc-select:focus { border-color: var(--color-primary); }
.loc-select:disabled { opacity: 0.4; cursor: not-allowed; }
.loc-select option { background: #1a1e2e; color: var(--color-text); }
</style>
