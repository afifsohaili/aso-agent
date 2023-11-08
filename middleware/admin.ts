export default defineNuxtRouteMiddleware((to, from) => {
  const user = useSupabaseUser()
  if (!user.value)
    return abortNavigation('Not permitted')

  if (user.value && user.value?.email !== 'afifnajib@gmail.com')
    return abortNavigation('Not permitted')
})
