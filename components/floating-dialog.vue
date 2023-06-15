<script lang="ts" setup>
const emit = defineEmits(['close'])
const dialog = ref<HTMLDialogElement | null>(null)
</script>

<template>
  <dialog ref="dialog" class="" @close="emit('close')" @keyup.esc="dialog?.close?.()">
    <slot />
  </dialog>
</template>
