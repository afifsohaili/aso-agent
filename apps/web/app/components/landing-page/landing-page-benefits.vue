<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div class="container p-8 md:p-0 mx-auto my-16">
    <div class="flex flex-col justify-center">
      <h2 class="text-4xl text-center text-gray-700">
        {{ t('landingpage.benefits.title') }}
      </h2>
      <div class="flex flex-wrap justify-center gap-5 mt-10 md:justify-around">
        <div class="pt-2 text-gray-400">
          <h3 class="font-bold text-xl">
            {{ t('landingpage.benefits.title1.title') }}
          </h3>
          <p>{{ t('landingpage.benefits.title1.text') }}</p>
        </div>
        <div class="pt-2 text-gray-400">
          <h3 class="font-bold text-xl">
            {{ t('landingpage.benefits.title2.title') }}
          </h3>
          <p>{{ t('landingpage.benefits.title2.text') }}</p>
        </div>
        <div class="pt-2 text-gray-400">
          <h3 class="font-bold text-xl">
            {{ t('landingpage.benefits.title3.title') }}
          </h3>
          <p>{{ t('landingpage.benefits.title3.text') }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
