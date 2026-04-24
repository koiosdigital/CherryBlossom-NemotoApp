<script setup lang="ts">
import {
  ToastProvider,
  ToastRoot,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastViewport,
} from 'reka-ui'
import { CheckCircle2, AlertTriangle, XCircle, X, Info } from 'lucide-vue-next'
import { useToast } from '@/composables/useToast'
import { cn } from '@/lib/utils'

const { toasts, dismiss } = useToast()

const variantClass: Record<string, string> = {
  default: 'border-border bg-card text-card-foreground',
  success:
    'border-emerald-500/30 bg-card text-card-foreground [&_[data-accent]]:text-emerald-500',
  warn:
    'border-amber-500/30 bg-card text-card-foreground [&_[data-accent]]:text-amber-500',
  destructive:
    'border-destructive/40 bg-card text-card-foreground [&_[data-accent]]:text-destructive',
}
</script>

<template>
  <ToastProvider>
    <ToastRoot
      v-for="t in toasts"
      :key="t.id"
      :duration="t.duration"
      @update:open="(open) => !open && dismiss(t.id)"
      :class="
        cn(
          'relative flex w-full items-start gap-3 rounded-md border p-4 pr-10 shadow-lg',
          'data-[state=open]:animate-in data-[state=open]:slide-in-from-top-full',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-80',
          'data-[swipe=move]:translate-x-[var(--reka-toast-swipe-move-x)]',
          'data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-transform',
          'data-[swipe=end]:translate-x-[var(--reka-toast-swipe-end-x)] data-[swipe=end]:animate-out',
          variantClass[t.variant] ?? variantClass.default
        )
      "
    >
      <span data-accent class="mt-0.5 shrink-0">
        <CheckCircle2 v-if="t.variant === 'success'" class="size-4" />
        <AlertTriangle v-else-if="t.variant === 'warn'" class="size-4" />
        <XCircle v-else-if="t.variant === 'destructive'" class="size-4" />
        <Info v-else class="size-4" />
      </span>
      <div class="flex min-w-0 flex-col gap-0.5">
        <ToastTitle class="display-face text-sm font-semibold">
          {{ t.title }}
        </ToastTitle>
        <ToastDescription
          v-if="t.description"
          class="text-xs text-muted-foreground"
        >
          {{ t.description }}
        </ToastDescription>
      </div>
      <ToastClose
        aria-label="Close"
        class="absolute right-2 top-2 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X class="size-3.5" />
      </ToastClose>
    </ToastRoot>
    <ToastViewport
      class="fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:bottom-4 sm:right-4 sm:top-auto sm:max-w-sm"
    />
  </ToastProvider>
</template>
