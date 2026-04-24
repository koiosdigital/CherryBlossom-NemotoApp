<script setup lang="ts">
import { cn } from '@/lib/utils'

const props = defineProps<{ modelValue?: string; class?: string; rows?: number }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()
</script>

<template>
  <textarea
    :value="props.modelValue"
    :rows="props.rows ?? 3"
    @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    :class="
      cn(
        'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
        'placeholder:text-muted-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50 resize-y',
        props.class
      )
    "
  />
</template>
