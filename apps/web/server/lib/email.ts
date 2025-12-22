export interface EmailJobData {
  to: string
  subject: string
  text?: string
  html?: string
}

export const EMAIL_QUEUE_NAME = 'email'
