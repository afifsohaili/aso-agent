import { db } from '~/utils/db'
import { useAuth } from '~/utils/auth'

export default defineEventHandler(async (event) => {
  const auth = useAuth(useRuntimeConfig(event))
  const session = await auth.api.getSession({
    headers: event.headers,
  })

  if (!session || !session.user)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const [organization] = await db
    .selectFrom('organizations')
    .innerJoin('memberships', 'organizations.id', 'memberships.organization_id')
    .where('memberships.user_id', '=', session.user.id)
    .select([
      'organizations.id',
      'organizations.name',
      'organizations.created_at',
      'organizations.updated_at',
      'memberships.role',
    ])
    .limit(1)
    .execute()

  return organization
})
