import type { EmailJobData } from '../lib/email'
import { EMAIL_QUEUE_NAME } from '../lib/email'

export default defineEventHandler(async () => {
  const emailQueue = useQueue<EmailJobData>(EMAIL_QUEUE_NAME)

  const job = await emailQueue.add('send-email', {
    to: 'test@example.com',
    subject: 'Test Email from BullMQ',
    text: 'This is a test email to verify the queue is working.',
    html: '<p>This is a test email to verify the queue is working.</p>',
  })

  return {
    success: true,
    jobId: job.id,
    message: 'Email job added to queue',
  }
})
