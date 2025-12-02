import { fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('get /api/healthcheck', async () => {
  const setupOptions = {}
  if (process.env.TEST_HOST) {
    setupOptions.host = process.env.TEST_HOST
  }

  await setup(setupOptions)

  it('should return 200 OK with database connection = true', async () => {
    const response = await fetch('/api/healthcheck')
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.database).toBe(true)
  })
})
