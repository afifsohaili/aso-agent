import { useDatabase } from '~~/utils/db'

export default defineEventHandler(async (event) => {
  try {
    const config = useRuntimeConfig(event)
    const db = useDatabase({ databaseUrl: config.databaseUrl })

    // Fetch all organizations for admin targeting
    const organizations = await db
      .selectFrom('organizations')
      .select(['id', 'name', 'slug', 'created_at'])
      .orderBy('name', 'asc')
      .execute()

    return organizations
  }
  catch (err: any) {
    console.error('Error fetching organizations:', err)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch organizations' })
  }
})
