import Icons from 'unplugin-icons/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  modules: [
    '@vueuse/nuxt',
    ['unplugin-icons/nuxt', {}],
  ],
  components: [
    { path: '~/components', pathPrefix: false },
  ],
  vite: {
    plugins: [
      Icons(),
    ],
  },
  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  },
})
