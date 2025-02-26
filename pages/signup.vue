<script setup>
import { authClient } from '~/lib/auth-client'

const session = authClient.useSession()
const router = useRouter()

// Redirect to home if already logged in
watchEffect(() => {
  if (session.data)
    router.push('/')
})
</script>

<template>
  <signup-form />
</template>
