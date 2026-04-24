<script setup lang="ts">
import { TabsRoot } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<{
  modelValue?: string
  defaultValue?: string
  class?: string
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()
</script>

<template>
  <TabsRoot
    :model-value="props.modelValue"
    :default-value="props.defaultValue"
    @update:model-value="emit('update:modelValue', String($event))"
    :class="cn('flex flex-col gap-4', props.class)"
  >
    <slot />
  </TabsRoot>
</template>
