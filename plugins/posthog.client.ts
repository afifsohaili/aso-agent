import posthog from 'posthog-js'

export default defineNuxtPlugin((_nuxtApp) => {
  if (process.env.NODE_ENV !== 'production')
    return { provide: { posthog: { capture: () => {} } } }

  posthog.init(_nuxtApp.$config.posthogApiKey, { api_host: 'https://app.posthog.com' })

  return { provide: { posthog } }
})
