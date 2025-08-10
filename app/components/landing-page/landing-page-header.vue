<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <nav class="container flex flex-wrap items-center justify-between p-8 mx-auto">
    <a href="/">
      <logo class="text-4xl" />
    </a>
    <div class="hidden md:flex gap-4">
      <a class="px-6 py-2 text-white bg-indigo-600 rounded-md md:ml-5" href="/">{{ t('landingpage.general.cta') }}</a>
      <div class="flex items-center">
        <language-switcher />
      </div>
    </div>
  </nav>
</template>
