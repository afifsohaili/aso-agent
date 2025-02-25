<script setup>
import { signOut, useSession } from '~/lib/auth-client'

const session = useSession()
const router = useRouter()

async function handleSignOut() {
  await signOut()
  router.push('/login')
}
</script>

<template>
  <div v-if="session.data" class="p-6 max-w-md mx-auto bg-white rounded-xl shadow-md">
    <div class="flex items-center space-x-4">
      <div class="flex-shrink-0">
        <div class="h-12 w-12 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold">
          {{ session.data.user?.email?.charAt(0).toUpperCase() }}
        </div>
      </div>
      <div>
        <div class="text-xl font-medium text-black">
          {{ session.data.user?.email }}
        </div>
        <p class="text-gray-500">
          User ID: {{ session.data.user?.id }}
        </p>
      </div>
    </div>
    <div class="mt-6">
      <button
        class="w-full bg-purple-900 text-white py-2 px-4 rounded hover:bg-purple-700 transition"
        @click="handleSignOut"
      >
        Sign Out
      </button>
    </div>
  </div>
  <div v-else class="p-6 max-w-md mx-auto bg-white rounded-xl shadow-md">
    <p class="text-center">
      Not logged in
    </p>
    <div class="mt-4 flex justify-center space-x-4">
      <NuxtLink to="/login" class="bg-purple-900 text-white py-2 px-4 rounded hover:bg-purple-700 transition">
        Log In
      </NuxtLink>
      <NuxtLink to="/signup" class="bg-gray-200 text-gray-800 py-2 px-4 rounded hover:bg-gray-300 transition">
        Sign Up
      </NuxtLink>
    </div>
  </div>
</template>
