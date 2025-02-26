<script setup>
const session = useSession()
const router = useRouter()

// Redirect to home if already logged in
watchEffect(() => {
  if (session.value)
    router.push('/')
})
</script>

<template>
  <signup-form />
</template>
