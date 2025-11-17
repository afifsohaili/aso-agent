<script lang="ts" setup>
import IconAccountBox from '~icons/mdi/account-box'
import { appInfo } from '~/composables/app'
</script>

<template>
  <h1>
    <a href="/">
      <IconAccountBox class="inline-block" />&nbsp;<strong>{{ appInfo.name }}</strong>
    </a>
  </h1>
</template>
