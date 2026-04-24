import { ref } from 'vue'

export type ToastVariant = 'default' | 'success' | 'warn' | 'destructive'

export type Toast = {
  id: number
  title: string
  description?: string
  variant: ToastVariant
  duration: number
}

const toasts = ref<Toast[]>([])
let nextId = 1

export function useToast() {
  function toast(opts: {
    title: string
    description?: string
    variant?: ToastVariant
    duration?: number
  }) {
    const t: Toast = {
      id: nextId++,
      title: opts.title,
      description: opts.description,
      variant: opts.variant ?? 'default',
      duration: opts.duration ?? 3500,
    }
    toasts.value.push(t)
    return t.id
  }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  return {
    toasts,
    toast,
    dismiss,
  }
}
