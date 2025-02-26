export default defineNuxtRouteMiddleware(async () => {
  const session = await authClient.useSession(useFetch)
  console.log('session', session.data.value)
  console.log('session', session.data.value?.user?.email)

  if (!session.data.value) {
    console.log('Not permitted session.data.value', session.data.value)
    return abortNavigation('Not permitted')
  }

  if (session.data.value && session.data.value.user?.email !== 'afifnajib@gmail.com') {
    console.log('Not permitted session.data.value.user?.email', session.data.value.user?.email)
    return abortNavigation('Not permitted')
  }
})
