import { useSession } from '~/lib/auth-client'

export default defineNuxtRouteMiddleware(async () => {
  const { data: session } = await useSession(useFetch)

  if (!session.value)
    return abortNavigation('Not permitted')

  if (session.value && session.value.user?.email !== 'afifnajib@gmail.com')
    return abortNavigation('Not permitted')
})
