<script setup lang="ts">
import BellIcon from '~icons/heroicons/bell'

const notificationBell = {
  refreshCount: () => {},
}

defineExpose(notificationBell)

const { data: countData, refresh: refreshCount } = await useFetch('/api/notifications/count', {
  query: { unread: 'true' },
  server: false, // Client-side only for real-time updates
})

const unreadCount = computed(() => countData.value?.unread_count || 0)

notificationBell.refreshCount = refreshCount

onMounted(() => {
  refreshCount()
})
</script>

<template>
  <NuxtLink
    to="/dashboard/notifications"
    class="relative -m-2.5 p-2.5 text-gray-400 hover:text-gray-500 transition-colors"
  >
    <span class="sr-only">View notifications</span>
    <BellIcon class="h-6 w-6" aria-hidden="true" />
    <span
      v-if="unreadCount > 0"
      class="absolute top-3 right-3 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full min-w-[1.25rem] h-5"
    >
      {{ unreadCount > 99 ? '99+' : unreadCount }}
    </span>
  </NuxtLink>
</template>
