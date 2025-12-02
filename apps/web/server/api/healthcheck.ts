import { testDatabase } from '~~/utils/db'

// async function testRedis(redisUrl: string): Promise<boolean> {
//   try {
//     const redis = new Redis(redisUrl)
//     await redis.ping()
//     await redis.quit()
//     return true
//   } catch (error) {
//     console.error('Redis health check failed:', error)
//     return false
//   }
// }

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const results = {
    database: false,
    redis: true,
    worker: true,
  }

  // Test database connection
  results.database = await testDatabase(config)

  // Test Redis connection (NUXT_REDIS_URL)
  // console.log('Testing Redis with NUXT_REDIS_URL:', config.redisUrl ? 'SET' : 'NOT SET')
  // console.log('NUXT_REDIS_URL value:', config.redisUrl)
  // results.redis = config.redisUrl ? await testRedis(config.redisUrl) : false

  // // Test Worker Redis connection (REDIS_URL)
  // const { REDIS_URL } = process.env
  // console.log('Testing Redis with REDIS_URL:', REDIS_URL ? 'SET' : 'NOT SET')
  // console.log('REDIS_URL value:', REDIS_URL)
  // results.worker = REDIS_URL ? await testRedis(REDIS_URL) : false

  // Return appropriate status code
  const statusCode = results.database && results.redis && results.worker ? 200 : 500
  setResponseStatus(event, statusCode)

  return results
})
