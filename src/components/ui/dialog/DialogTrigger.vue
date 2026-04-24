<script setup lang="ts">
import { DialogTrigger } from 'reka-ui'

defineProps<{ asChild?: boolean }>()
</script>

<template>
  <DialogTrigger :as-child="$props.asChild">
    <slot />
  </DialogTrigger>
</template>
