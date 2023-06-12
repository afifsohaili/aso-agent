<script lang="ts" setup>
import { appInfo } from '~/composables/app'
</script>

<template>
  <h1>
    <i-ph-cloud-snow-duotone class="inline-block" />
    <span>{{ appInfo.name }}</span>
  </h1>
</template>
