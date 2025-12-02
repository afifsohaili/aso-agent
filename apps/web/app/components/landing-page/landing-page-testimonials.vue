<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const imgSources = [
  'https://picsum.photos/100/100',
  'https://picsum.photos/101/101',
  'https://picsum.photos/102/102',
]
</script>

<template>
  <div class="container p-8 mx-auto my-16">
    <div class="flex flex-col justify-center">
      <h2 class="text-4xl text-center text-gray-700">
        {{ t('landingpage.testimonials.title') }}
      </h2>
      <div class="flex flex-wrap justify-center gap-5 mt-10 md:justify-around">
        <div v-for="n in 3" :key="n" class="pt-2 text-gray-400 flex flex-col items-center">
          <img :src="imgSources[n]" alt="testimonials avatar" class="h-30 w-30 rounded-full border-4">
          <h3 class="font-bold text-xl mt-4">
            {{ t(`landingpage.testimonials.title${n}.title`) }}
          </h3>
          <p>{{ t(`landingpage.testimonials.title${n}.text`) }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
