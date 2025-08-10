<script setup>
const { session } = await useSession()

const handleLogout = async () => {
  await useAuthClient().signOut()
  window.location.reload()
}
</script>

<template>
  <pre-dev>{{ session || 'null' }}</pre-dev>
  <div v-if="session">
    Already logged in

    <button class="block" @click="handleLogout">
      Logout
    </button>
  </div>
  <login-form v-else />
</template>
