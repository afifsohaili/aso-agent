<script setup>
const user = computed(() => useSupabaseUser())
const signout = () => useSupabaseClient().auth.signOut()
</script>

<template>
  <div v-if="user.value">
    Already logged in

    <button class="block" @click="signout">
      Logout
    </button>
  </div>
  <login-form v-else />
</template>
