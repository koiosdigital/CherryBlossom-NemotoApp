<script setup lang="ts">
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { computed, ref, watch } from 'vue'
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  VisuallyHidden,
} from 'reka-ui'
import { Moon, Sun, Menu, X } from 'lucide-vue-next'
import SakuraIcon from '@/components/icons/SakuraIcon.vue'
import { useTheme } from '@/composables/useTheme'
import { Button } from '@/components/ui/button'

const route = useRoute()
const router = useRouter()
const { mode, toggleMode } = useTheme()

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/presets', label: 'Presets' },
  { to: '/schedules', label: 'Schedules' },
  { to: '/settings', label: 'Settings' },
]

const current = computed(() => route.path)

const menuOpen = ref(false)

watch(
  () => route.path,
  () => {
    menuOpen.value = false
  },
)

function go(to: string) {
  router.push(to)
}
</script>

<template>
  <header
    class="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60"
  >
    <div class="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
      <RouterLink to="/" class="flex items-center gap-2 font-semibold display-face">
        <span
          class="inline-flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground"
        >
          <SakuraIcon class="size-6" />
        </span>
        <span>Cherry Blossom</span>
      </RouterLink>

      <nav class="ml-4 hidden items-center gap-1 md:flex">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="rounded-md px-3 py-1.5 text-sm transition-colors hover:text-foreground"
          :class="current === item.to ? 'bg-secondary text-foreground' : 'text-muted-foreground'"
        >
          {{ item.label }}
        </RouterLink>
      </nav>

      <div class="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          :aria-label="mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
          @click="toggleMode"
        >
          <Sun v-if="mode === 'dark'" />
          <Moon v-else />
        </Button>
        <Button
          class="md:hidden"
          variant="ghost"
          size="icon"
          aria-label="Open menu"
          @click="menuOpen = true"
        >
          <Menu />
        </Button>
      </div>
    </div>

    <DialogRoot v-model:open="menuOpen">
      <DialogPortal>
        <DialogOverlay
          class="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 md:hidden"
        />
        <DialogContent
          class="fixed inset-x-0 top-0 z-50 flex flex-col gap-4 border-b border-border bg-card p-4 shadow-lg focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top md:hidden"
        >
          <VisuallyHidden>
            <DialogTitle>Navigation</DialogTitle>
            <DialogDescription>Jump to another page.</DialogDescription>
          </VisuallyHidden>

          <div class="flex items-center justify-between">
            <span class="eyebrow">Menu</span>
            <Button variant="ghost" size="icon" aria-label="Close menu" @click="menuOpen = false">
              <X />
            </Button>
          </div>

          <nav class="flex flex-col">
            <button
              v-for="item in navItems"
              :key="item.to"
              type="button"
              class="flex items-center justify-between rounded-md px-3 py-3 text-left text-sm transition-colors hover:bg-muted"
              :class="
                current === item.to ? 'bg-secondary text-foreground' : 'text-muted-foreground'
              "
              @click="go(item.to)"
            >
              <span>{{ item.label }}</span>
              <span v-if="current === item.to" class="status-dot text-primary" />
            </button>
          </nav>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </header>
</template>
