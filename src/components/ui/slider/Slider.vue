<script setup lang="ts">
import { SliderRoot, SliderTrack, SliderRange, SliderThumb } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<{
  modelValue?: number[]
  min?: number
  max?: number
  step?: number
  class?: string
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: number[]): void }>()
</script>

<template>
  <SliderRoot
    :model-value="props.modelValue"
    :min="props.min"
    :max="props.max"
    :step="props.step"
    @update:model-value="emit('update:modelValue', ($event ?? []) as number[])"
    :class="
      cn(
        'relative flex w-full touch-none select-none items-center',
        props.class
      )
    "
  >
    <SliderTrack
      class="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted"
    >
      <SliderRange class="absolute h-full bg-primary" />
    </SliderTrack>
    <template v-for="(_, i) in props.modelValue ?? [0]" :key="i">
      <SliderThumb
        class="block size-4 rounded-full border-2 border-primary bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />
    </template>
  </SliderRoot>
</template>
