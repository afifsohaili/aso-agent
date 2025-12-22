import { createAuthClient } from 'better-auth/vue' // make sure to import from better-auth/vue

export async function useSession() {
  const { data, status } = await useFetch('/api/auth/get-session', {
    deep: true,
  })
  return { session: data, isLoading: computed(() => status.value === 'pending') }
}

export function useAuthClient() {
  return createAuthClient({
    baseURL: `${useRuntimeConfig().public.siteUrl}/api/auth`,
    // You can pass client configuration here if needed
  })
}
