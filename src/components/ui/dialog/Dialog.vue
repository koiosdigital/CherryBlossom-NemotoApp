<script setup lang="ts">
import { DialogRoot } from 'reka-ui'

const props = defineProps<{ open?: boolean }>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>()
</script>

<template>
  <DialogRoot :open="props.open" @update:open="emit('update:open', $event)">
    <slot />
  </DialogRoot>
</template>
