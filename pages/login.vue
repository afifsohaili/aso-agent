<script setup>
import { signOut, useSession } from '~/lib/auth-client'

const session = useSession()
</script>

<template>
  <div v-if="session.data">
    Already logged in

    <button class="block" @click="signOut">
      Logout
    </button>
  </div>
  <login-form v-else />
</template>
