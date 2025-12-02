import { useAuth } from '~~/utils/auth'

export default defineEventHandler(async (event) => {
  const auth = useAuth(useRuntimeConfig(event))
  return auth.handler(toWebRequest(event))
})
