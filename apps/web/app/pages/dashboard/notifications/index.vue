<script setup lang="ts">
definePageMeta({
  middleware: ['auth'],
  layout: 'dashboard',
})

const isMarkingAsRead = ref(false)
const selectedNotifications = ref<number[]>([])

const { showErrorAlert, showSuccessAlert } = useGlobalAlert()

// Fetch notifications
const { data: notifications, refresh: refreshNotifications } = await useFetch('/api/notifications')

const notificationsList = computed(() => notifications.value || [])
const unreadNotifications = computed(() => notificationsList.value.filter(n => !n.is_read))
const readNotifications = computed(() => notificationsList.value.filter(n => n.is_read))

function getTypeClass(type: string) {
  switch (type) {
    case 'success': return 'text-green-600'
    case 'warning': return 'text-yellow-600'
    case 'error': return 'text-red-600'
    default: return 'text-blue-600'
  }
}

function getTypeIcon(type: string) {
  // Return SVG path data for different notification types
  switch (type) {
    case 'success':
      return 'M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z'
    case 'warning':
      return 'M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z'
    case 'error':
      return 'M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z'
    default: // info
      return 'M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z'
  }
}

async function markAsRead(notificationIds: number[]) {
  if (notificationIds.length === 0)
    return

  isMarkingAsRead.value = true
  try {
    await $fetch('/api/notifications', {
      method: 'PUT',
      body: { notification_ids: notificationIds },
    })

    showSuccessAlert(`${notificationIds.length} notification(s) marked as read`, 'Success', { clearAfter: 2000 })
    await refreshNotifications()

    // Clear selections
    selectedNotifications.value = []
  }
  catch (error: any) {
    console.error('Failed to mark notifications as read:', error)
    const errorMessage = error?.data?.statusMessage || error?.message || 'Failed to mark notifications as read'
    showErrorAlert(errorMessage, 'Error')
  }
  finally {
    isMarkingAsRead.value = false
  }
}

async function markAllAsRead() {
  if (unreadNotifications.value.length === 0)
    return

  isMarkingAsRead.value = true
  try {
    await $fetch('/api/notifications', {
      method: 'PUT',
      body: { mark_all: true },
    })

    showSuccessAlert('All notifications marked as read', 'Success', { clearAfter: 2000 })
    await refreshNotifications()
  }
  catch (error: any) {
    console.error('Failed to mark all notifications as read:', error)
    const errorMessage = error?.data?.statusMessage || error?.message || 'Failed to mark notifications as read'
    showErrorAlert(errorMessage, 'Error')
  }
  finally {
    isMarkingAsRead.value = false
  }
}

function toggleNotificationSelection(notificationId: number) {
  const index = selectedNotifications.value.indexOf(notificationId)
  if (index > -1)
    selectedNotifications.value.splice(index, 1)

  else
    selectedNotifications.value.push(notificationId)
}

function selectAllUnread() {
  selectedNotifications.value = unreadNotifications.value.map(n => n.id)
}

function clearSelection() {
  selectedNotifications.value = []
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <div class="px-4 py-6 sm:px-6 lg:px-8">
    <div class="max-w-4xl mx-auto">
      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-2xl font-semibold text-gray-900">
          Notifications
        </h1>
        <p class="mt-2 text-sm text-gray-600">
          Stay updated with important messages and announcements.
        </p>
      </div>

      <!-- Actions Bar -->
      <div v-if="unreadNotifications.length > 0" class="mb-6 flex flex-wrap items-center gap-4">
        <div class="flex items-center space-x-2">
          <button
            :disabled="isMarkingAsRead"
            class="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            @click="markAllAsRead"
          >
            <span :class="{ 'pr-2': isMarkingAsRead }">Mark All Read</span>
            <app-loading v-if="isMarkingAsRead" class="w-4 h-4" />
          </button>

          <div v-if="selectedNotifications.length > 0" class="flex items-center space-x-2">
            <button
              :disabled="isMarkingAsRead"
              class="inline-flex items-center px-3 py-2 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              @click="markAsRead(selectedNotifications)"
            >
              Mark {{ selectedNotifications.length }} Read
            </button>
            <button
              class="text-sm text-gray-500 hover:text-gray-700"
              @click="clearSelection"
            >
              Clear
            </button>
          </div>
        </div>

        <div class="text-sm text-gray-500">
          {{ unreadNotifications.length }} unread, {{ readNotifications.length }} read
        </div>
      </div>

      <!-- Quick Actions for Unread -->
      <div v-if="unreadNotifications.length > 0" class="mb-4 flex items-center justify-between">
        <span class="text-sm text-gray-600">
          {{ unreadNotifications.length }} unread notifications
        </span>
        <div class="flex space-x-2 text-sm">
          <button
            class="text-blue-600 hover:text-blue-800"
            @click="selectAllUnread"
          >
            Select all unread
          </button>
        </div>
      </div>

      <!-- Notifications List -->
      <div class="space-y-4">
        <!-- Unread Notifications -->
        <div v-if="unreadNotifications.length > 0">
          <h2 class="text-lg font-medium text-gray-900 mb-4">
            Unread
          </h2>
          <div class="space-y-3">
            <div
              v-for="notification in unreadNotifications"
              :key="notification.id"
              class="bg-blue-50 border border-blue-200 rounded-lg p-4 transition-colors"
              :class="{ 'ring-2 ring-blue-500': selectedNotifications.includes(notification.id) }"
            >
              <div class="flex items-start space-x-3">
                <div class="flex-shrink-0 pt-1">
                  <input
                    :checked="selectedNotifications.includes(notification.id)"
                    type="checkbox"
                    class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    @change="toggleNotificationSelection(notification.id)"
                  >
                </div>
                <div :class="getTypeClass(notification.type)" class="flex-shrink-0">
                  <svg class="h-6 w-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" :d="getTypeIcon(notification.type)" clip-rule="evenodd" />
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium text-gray-900">
                    {{ notification.title }}
                  </div>
                  <div class="text-sm text-gray-700 mt-1">
                    {{ notification.message }}
                  </div>
                  <div class="text-xs text-gray-500 mt-2 flex items-center space-x-4">
                    <span>{{ formatDate(notification.created_at) }}</span>
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                      Unread
                    </span>
                  </div>
                </div>
                <div class="flex-shrink-0">
                  <button
                    :disabled="isMarkingAsRead"
                    class="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
                    @click="markAsRead([notification.id])"
                  >
                    Mark read
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Read Notifications -->
        <div v-if="readNotifications.length > 0">
          <h2 class="text-lg font-medium text-gray-900 mb-4" :class="{ 'mt-8': unreadNotifications.length > 0 }">
            Read
          </h2>
          <div class="space-y-3">
            <div
              v-for="notification in readNotifications"
              :key="notification.id"
              class="bg-white border border-gray-200 rounded-lg p-4"
            >
              <div class="flex items-start space-x-3">
                <div :class="getTypeClass(notification.type)" class="flex-shrink-0 opacity-60">
                  <svg class="h-6 w-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" :d="getTypeIcon(notification.type)" clip-rule="evenodd" />
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium text-gray-700">
                    {{ notification.title }}
                  </div>
                  <div class="text-sm text-gray-600 mt-1">
                    {{ notification.message }}
                  </div>
                  <div class="text-xs text-gray-500 mt-2 flex items-center space-x-4">
                    <span>{{ formatDate(notification.created_at) }}</span>
                    <span v-if="notification.read_at" class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                      Read {{ formatDate(notification.read_at) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-if="notificationsList.length === 0" class="text-center py-12">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <h3 class="mt-2 text-sm font-medium text-gray-900">
            No notifications
          </h3>
          <p class="mt-1 text-sm text-gray-500">
            You're all caught up! New notifications will appear here.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
