<template>
  <router-view />
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useDidStore } from './stores/did'

const store = useDidStore()

onMounted(() => {
  store.load()
})
</script>
