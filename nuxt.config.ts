import tailwindcss from '@tailwindcss/vite'
import Icons from 'unplugin-icons/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  modules: [
    'radix-vue/nuxt',
    '@vueuse/nuxt',
    ['unplugin-icons/nuxt', {}],
    '@nuxtjs/sitemap',
    '@nuxt/content',
    '@nuxt/image',
  ],
  components: [
    { path: '~/components', pathPrefix: false },
  ],
  vite: {
    plugins: [
      Icons(),
      tailwindcss(),
    ],
  },
  runtimeConfig: {
    public: {
      betterAuthUrl: '',
      turnstileSiteKey: '',
    },
    betterAuthSecret: '',
    posthogApiKey: '',
    databaseUrl: '',
    turnstileSecretKey: '',
  },
  postcss: {
    plugins: {
      autoprefixer: {},
    },
  },
  sitemap: {
    exclude: [
      '/admin/**',
      '/admin',
      '/login',
      '/signup',
      '/forgot-password',
    ],
  },
  compatibilityDate: '2025-05-14',
})
