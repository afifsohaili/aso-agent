import { createI18n } from 'vue-i18n'
import en from '~/locales/en.json'
import my from '~/locales/my.json'

export default defineNuxtPlugin(({ vueApp }) => {
  const i18n = createI18n({
    legacy: false,
    globalInjection: true,
    locale: 'en',
    messages: { en, my },
  })

  vueApp.use(i18n)
})
