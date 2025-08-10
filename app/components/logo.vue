<script lang="ts" setup>
import { appInfo } from '~/composables/app'
import IconAccountBox from '~icons/mdi/account-box'
</script>

<template>
  <h1>
    <a href="/">
      <IconAccountBox class="inline-block" />&nbsp;<strong>{{ appInfo.name }}</strong>
    </a>
  </h1>
</template>
