<template>
  <main>
    <slot/>
  </main>
</template>

<script setup>
useHead({
  title: 'My App',
  meta: [
    { charset: 'utf-8' },
  ],
  link: [
    { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    { rel: 'alternate icon', type: 'image/png', href: '/favicon.png' },
  ],
})
</script>
