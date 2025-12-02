import posthog from 'posthog-js'

export default defineNuxtPlugin((nuxtApp: any) => {
  if (import.meta.env.MODE !== 'production')
    return { provide: { posthog: { capture: () => {} } } }

  posthog.init(nuxtApp.$config.posthogApiKey as string, { api_host: 'https://app.posthog.com' })

  return { provide: { posthog } as any }
})
