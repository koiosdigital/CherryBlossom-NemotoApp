import { ref, watchEffect } from 'vue'

export type Mode = 'light' | 'dark'

const MODE_KEY = 'nemoto.mode'

function initialMode(): Mode {
  const v = localStorage.getItem(MODE_KEY)
  if (v === 'light' || v === 'dark') return v
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

const mode = ref<Mode>(initialMode())

watchEffect(() => {
  document.documentElement.classList.toggle('dark', mode.value === 'dark')
  localStorage.setItem(MODE_KEY, mode.value)
})

export function useTheme() {
  return {
    mode,
    setMode(m: Mode) {
      mode.value = m
    },
    toggleMode() {
      mode.value = mode.value === 'dark' ? 'light' : 'dark'
    },
  }
}
