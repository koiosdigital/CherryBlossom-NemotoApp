<script setup lang="ts">
import { Separator } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<{
  orientation?: 'horizontal' | 'vertical'
  class?: string
}>()
</script>

<template>
  <Separator
    :orientation="props.orientation ?? 'horizontal'"
    :class="
      cn(
        'bg-border shrink-0',
        (props.orientation ?? 'horizontal') === 'horizontal'
          ? 'h-px w-full'
          : 'w-px h-full',
        props.class
      )
    "
  />
</template>
