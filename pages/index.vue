<script setup>
import { useI18n } from 'vue-i18n'
import { appInfo } from '~/composables/app'

const { t } = useI18n()
</script>

<template>
  <language-switcher />
  <h1>{{ t('welcome', { appName: appInfo.title }) }}</h1>
  <landing-page />
</template>
