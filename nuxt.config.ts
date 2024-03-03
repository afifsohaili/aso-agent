import Icons from 'unplugin-icons/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  modules: [
    '@vueuse/nuxt',
    ['unplugin-icons/nuxt', {}],
    ['@nuxtjs/supabase', { redirect: false }],
    '@nuxtjs/sitemap',
  ],
  components: [
    { path: '~/components', pathPrefix: false },
  ],
  vite: {
    plugins: [
      Icons(),
    ],
  },
  runtimeConfig: {
    public: {
      supabaseUrl: '',
      supabaseKey: '',
    },
    supabaseServiceRoleKey: '',
    posthogApiKey: '',
  },
  postcss: {
    plugins: {
      tailwindcss: {},
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
})
