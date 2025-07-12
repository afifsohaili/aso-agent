export default defineNuxtRouteMiddleware(async () => {
  const session = await useAuthClient().useSession(useFetch)

  if (!session.data.value)
    return abortNavigation('Not permitted')

  if (session.data.value && session.data.value.user?.email !== 'afifnajib@gmail.com')
    return abortNavigation('Not permitted')
})
