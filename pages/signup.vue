<script setup>
import { useSession } from '~/lib/auth-client'

const session = useSession()
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
