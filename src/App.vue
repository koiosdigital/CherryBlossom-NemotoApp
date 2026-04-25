<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterView } from 'vue-router'
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from 'reka-ui'
import { Loader2 } from 'lucide-vue-next'
import AppHeader from '@/components/layout/AppHeader.vue'
import { Toaster } from '@/components/ui/toast'
import { useWebsocket } from '@/composables/useWebsocket'

const ws = useWebsocket()

// Don't pop the modal at first load (the WS takes a moment to handshake) and
// don't pop on tiny network blips. Wait until the connection has been down
// for 4 s before showing it.
const showDisconnect = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null
watch(
  () => ws.connected.value,
  (open) => {
    if (open) {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      showDisconnect.value = false
    } else if (ws.everConnected.value) {
      timer = setTimeout(() => {
        showDisconnect.value = true
      }, 4000)
    }
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})

const dialogOpen = computed(() => showDisconnect.value)
</script>

<template>
  <div class="min-h-dvh">
    <AppHeader />
    <main class="mx-auto max-w-6xl px-6 py-8">
      <RouterView />
    </main>
    <Toaster />

    <!-- Reconnecting overlay (non-dismissible). Only appears after the WS
         has been down for several seconds, so brief blips don't flash a
         scary modal. -->
    <DialogRoot :open="dialogOpen">
      <DialogPortal>
        <DialogOverlay
          class="fixed inset-0 z-100 bg-foreground/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0"
        />
        <DialogContent
          class="fixed left-1/2 top-1/2 z-101 flex w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 rounded-lg border border-border bg-card p-6 text-center shadow-lg focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          @pointer-down-outside="(e: Event) => e.preventDefault()"
          @escape-key-down="(e: KeyboardEvent) => e.preventDefault()"
        >
          <Loader2 class="size-8 animate-spin text-primary" />
          <DialogTitle class="display-face text-lg font-semibold">
            Reconnecting…
          </DialogTitle>
          <DialogDescription class="text-sm text-muted-foreground">
            Lost connection to the display. Live updates will resume
            automatically when it's back.
          </DialogDescription>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </div>
</template>
