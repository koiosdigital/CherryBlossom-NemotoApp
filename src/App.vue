<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import { Toaster } from '@/components/ui/toast'
</script>

<template>
  <div class="min-h-dvh">
    <AppHeader />
    <main class="mx-auto max-w-6xl px-6 py-8">
      <RouterView />
    </main>
    <Toaster />
  </div>
</template>
