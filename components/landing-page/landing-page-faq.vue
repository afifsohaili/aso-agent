<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div class="container mx-auto md:px-32 p-8">
    <h3 class="text-center text-4xl mb-8">
      {{ t('landingpage.faq.title') }}
    </h3>
    <div class="drop-shadow">
      <p v-for="n in 10" :key="n" class="text mt-4 p-4 bg-purple-200 rounded-lg">
        <strong class="block mb-2">Q: {{ t(`landingpage.faq.title${n}.title`) }}</strong>
        A: {{ t(`landingpage.faq.title${n}.answer`) }}
      </p>
    </div>
  </div>
</template>
