<script lang="ts" setup>
import { appInfo } from '~/composables/app'
</script>

<template>
  <h1>
    <i-ph-cloud-snow-duotone class="inline-block" />&nbsp;<strong>{{ appInfo.name }}</strong>
  </h1>
</template>
