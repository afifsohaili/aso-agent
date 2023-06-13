<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div class="container p-8 md:p-0 mx-auto md:flex my-16 justify-between">
    <div class="md:order-2">
      <div class="flex flex-col w-full mt-4">
        <h3
          class="max-w-2xl mt-3 text-3xl leading-snug tracking-tight text-gray-800"
        >
          {{ t('landingpage.problem.title') }}
        </h3>
        <p class="max-w-2xl py-4 leading-normal text-gray-500">
          <strong>{{ t('landingpage.problem.pain.title') }}</strong> {{ t('landingpage.problem.pain.text') }}
        </p>
        <p class="max-w-2xl py-4 leading-normal text-gray-500">
          <strong>{{ t('landingpage.problem.agitate.title') }}</strong> {{ t('landingpage.problem.agitate.text') }}
        </p>
        <p class="max-w-2xl py-4 leading-normal text-gray-500">
          <strong>{{ t('landingpage.problem.solution.title') }}</strong> {{ t('landingpage.problem.solution.text') }}
        </p>
      </div>
    </div>
    <img
      alt="Benefits" loading="lazy" width="521" height="548" decoding="async" data-nimg="1"
      class="object-cover md:mr-8" style="color: transparent;"
      src="https://picsum.photos/500/500"
    >
  </div>
</template>
