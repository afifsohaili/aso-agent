<script lang="ts" setup>
import { appInfo } from '~/composables/app'
import IconAccountBox from '~icons/mdi/account-box'
</script>

<template>
  <h1>
    <icon-account-box class="inline-block" />&nbsp;<strong>{{ appInfo.name }}</strong>
  </h1>
</template>
