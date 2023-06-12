<script lang="ts" setup>
const hero = ref({
  headline: '',
  subheadline: '',
  callToActionText: '',
  results: [

  ],
  img: '',
})
</script>

<template>
  <main class="min-h-screen">
    <h1>{{ hero.headline }}</h1>
    <h2>{{ hero.subheadline }}</h2>
    <button type="button">
      {{ hero.callToActionText }}
    </button>
    <ul>
      <li>{{ hero.results[0] }}</li>
      <li>{{ hero.results[1] }}</li>
      <li>{{ hero.results[2] }}</li>
    </ul>
  </main>
</template>
