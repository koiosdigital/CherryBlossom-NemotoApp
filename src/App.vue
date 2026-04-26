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
import { Loader2, RefreshCw } from 'lucide-vue-next'
import AppHeader from '@/components/layout/AppHeader.vue'
import { Toaster } from '@/components/ui/toast'
import { Button } from '@/components/ui'
import { useWebsocket } from '@/composables/useWebsocket'
import { useToast } from '@/composables/useToast'

const ws = useWebsocket()
const { toast } = useToast()

// Hold off the modal for a brief grace period so single-frame blips don't
// flash a scary dialog. 1.5s is short enough to feel responsive but long
// enough to skip the page-load handshake gap.
const SHOW_AFTER_MS = 1500

const showDisconnect = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

watch(
  () => ws.connected.value,
  (open, wasOpen) => {
    if (open) {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      // Only celebrate if the modal was actually visible — otherwise this
      // fires on every page-load handshake.
      if (showDisconnect.value) {
        toast({ title: 'Reconnected', variant: 'success', duration: 2000 })
      }
      showDisconnect.value = false
    } else if (ws.everConnected.value && wasOpen !== false) {
      // Connection just dropped (was true, now false).
      timer = setTimeout(() => {
        showDisconnect.value = true
      }, SHOW_AFTER_MS)
    }
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})

const dialogOpen = computed(() => showDisconnect.value)

function tryNow() {
  ws.forceReconnect()
}
</script>

<template>
  <div class="min-h-dvh">
    <AppHeader />
    <main class="mx-auto max-w-6xl px-6 py-8">
      <RouterView />
    </main>
    <Toaster />

    <!-- Reconnecting overlay. Non-dismissible — the page is showing stale
         data until we're back, so an explicit "we're working on it" beats
         silent staleness. -->
    <DialogRoot :open="dialogOpen">
      <DialogPortal>
        <DialogOverlay
          class="fixed inset-0 z-100 bg-foreground/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0"
        />
        <DialogContent
          class="fixed left-1/2 top-1/2 z-101 flex w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-4 rounded-lg border border-border bg-card p-6 text-center shadow-lg focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          @pointer-down-outside="(e: Event) => e.preventDefault()"
          @escape-key-down="(e: KeyboardEvent) => e.preventDefault()"
        >
          <Loader2 class="size-8 animate-spin text-primary" />
          <div class="flex flex-col gap-1">
            <DialogTitle class="display-face text-lg font-semibold">
              Reconnecting…
            </DialogTitle>
            <DialogDescription class="text-sm text-muted-foreground">
              Lost connection to the display. Live updates are paused until
              it's back.
            </DialogDescription>
          </div>
          <p
            v-if="ws.reconnectAttempts.value > 1"
            class="num text-xs text-muted-foreground"
          >
            Attempt {{ ws.reconnectAttempts.value }}
          </p>
          <Button variant="outline" size="sm" @click="tryNow">
            <RefreshCw />
            Try now
          </Button>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </div>
</template>
