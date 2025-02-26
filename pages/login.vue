<script setup>
const session = useSession()

const handleLogout = async () => {
  await authClient.signOut()
  window.location.reload()
}
</script>

<template>
  <div v-if="session">
    <pre-dev>{{ session }}</pre-dev>
    Already logged in

    <button class="block" @click="handleLogout">
      Logout
    </button>
  </div>
  <login-form v-else />
</template>
