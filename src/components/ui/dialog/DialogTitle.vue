<script setup lang="ts">
import { DialogTitle } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<{ class?: string }>()
</script>

<template>
  <DialogTitle
    :class="cn('display-face text-lg font-semibold leading-none', props.class)"
  >
    <slot />
  </DialogTitle>
</template>
