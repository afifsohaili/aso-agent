<script setup>
import { authClient } from '~/lib/auth-client'

const { data: session } = useFetch('/api/auth/get-session')

const handleLogout = async () => {
  await authClient.signOut()
  window.location.reload()
}
</script>

<template>
  <div v-if="session">
    Already logged in

    <button class="block" @click="handleLogout">
      Logout
    </button>
  </div>
  <login-form v-else />
</template>
