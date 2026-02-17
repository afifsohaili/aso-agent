import { fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('get /api/healthcheck', async () => {
  // Use pre-started server if TEST_HOST is set, otherwise start a new one
  await setup({
    host: process.env.TEST_HOST,
  })

  it('should return 200 OK with database connection = true', async () => {
    const response = await fetch('/api/healthcheck')
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.database).toBe(true)
  })
})
