<script setup lang="ts">
interface NotificationProps {
  notification: {
    id: number
    title: string
    message: string
    type: 'info' | 'warning' | 'success' | 'error'
    created_at: string
    is_read: boolean
    read_at?: string | null
  }
  showCheckbox?: boolean
  selected?: boolean
  onSelect?: (id: number) => void
  onMarkAsRead?: (id: number) => void
}

const props = withDefaults(defineProps<NotificationProps>(), {
  showCheckbox: false,
  selected: false,
})

function getTypeClass(type: string) {
  switch (type) {
    case 'success': return 'text-green-600'
    case 'warning': return 'text-yellow-600'
    case 'error': return 'text-red-600'
    default: return 'text-blue-600'
  }
}

function getTypeIcon(type: string) {
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

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function handleSelect() {
  if (props.onSelect)
    props.onSelect(props.notification.id)
}

function handleMarkAsRead() {
  if (props.onMarkAsRead && !props.notification.is_read)
    props.onMarkAsRead(props.notification.id)
}
</script>

<template>
  <div
    class="rounded-lg p-4 transition-colors"
    :class="[
      notification.is_read
        ? 'bg-white border border-gray-200'
        : 'bg-blue-50 border border-blue-200',
      { 'ring-2 ring-blue-500': selected },
    ]"
  >
    <div class="flex items-start space-x-3">
      <!-- Checkbox -->
      <div v-if="showCheckbox" class="flex-shrink-0 pt-1">
        <input
          :checked="selected"
          type="checkbox"
          class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          @change="handleSelect"
        >
      </div>

      <!-- Type Icon -->
      <div
        :class="[getTypeClass(notification.type), { 'opacity-60': notification.is_read }]"
        class="flex-shrink-0"
      >
        <svg class="h-6 w-6" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" :d="getTypeIcon(notification.type)" clip-rule="evenodd" />
        </svg>
      </div>

      <!-- Content -->
      <div class="flex-1 min-w-0">
        <div
          class="text-sm font-medium"
          :class="notification.is_read ? 'text-gray-700' : 'text-gray-900'"
        >
          {{ notification.title }}
        </div>
        <div
          class="text-sm mt-1"
          :class="notification.is_read ? 'text-gray-600' : 'text-gray-700'"
        >
          {{ notification.message }}
        </div>
        <div class="text-xs text-gray-500 mt-2 flex items-center space-x-4">
          <span>{{ formatDate(notification.created_at) }}</span>
          <span
            v-if="!notification.is_read"
            class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
          >
            Unread
          </span>
          <span
            v-else-if="notification.read_at"
            class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700"
          >
            Read {{ formatDate(notification.read_at) }}
          </span>
        </div>
      </div>

      <!-- Actions -->
      <div v-if="!notification.is_read && onMarkAsRead" class="flex-shrink-0">
        <button
          class="text-sm text-blue-600 hover:text-blue-800"
          @click="handleMarkAsRead"
        >
          Mark read
        </button>
      </div>
    </div>
  </div>
</template>
