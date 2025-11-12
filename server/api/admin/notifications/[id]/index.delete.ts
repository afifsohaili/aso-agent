import { deleteNotification, getNotificationById } from '~~/server/lib/notifications'

export default defineEventHandler(async (event) => {
  try {
    const id = getRouterParam(event, 'id')

    if (!id || Number.isNaN(Number(id)))
      throw createError({ statusCode: 400, statusMessage: 'Invalid notification ID' })

    const notificationId = Number(id)

    // Check if notification exists
    const existingNotification = await getNotificationById(notificationId)
    if (!existingNotification)
      throw createError({ statusCode: 404, statusMessage: 'Notification not found' })

    const deletedNotification = await deleteNotification(notificationId)

    return { success: true, notification: deletedNotification }
  }
  catch (err: any) {
    console.error('Error deleting notification:', err)
    if (err.statusCode)
      throw err

    throw createError({ statusCode: 500, statusMessage: 'Failed to delete notification' })
  }
})
