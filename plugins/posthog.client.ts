import posthog from 'posthog-js'

export default defineNuxtPlugin((nuxtApp: any) => {
  if (process.env.NODE_ENV !== 'production')
    return { provide: { posthog: { capture: () => {} } } }

  posthog.init(nuxtApp.$config.posthogApiKey as string, { api_host: 'https://app.posthog.com' })

  return { provide: { posthog } }
})
