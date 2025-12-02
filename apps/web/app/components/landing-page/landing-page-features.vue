<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <section class="container my-16 mx-auto p-8 md:p-0">
    <h3 class="text-center text-4xl mb-8">
      {{ t('landingpage.features.title') }}
    </h3>
    <div class="md:grid grid-cols-2 md:gap-4 mt-8">
      <div v-for="n in 10" :key="n" class="p-4 bg-purple-100 rounded-lg drop-shadow md:mb-0 mb-4">
        <h4 class="font-bold">
          <i-mdi-check class="inline-block text-lg text-purple-500 mr-2" />
          {{ t(`landingpage.features.title${n}.title`) }}
        </h4>
      </div>
    </div>
  </section>
</template>
