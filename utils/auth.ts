import { betterAuth } from 'better-auth'
import pg from 'pg'
import { PostgresDialect } from 'kysely'
import { createAuthMiddleware } from 'better-auth/api'

if (!process.env.NUXT_DATABASE_URL)
  throw new Error('NUXT_DATABASE_URL is not set')

// Create a PostgreSQL connection pool
const pool = new pg.Pool({
  connectionString: process.env.NUXT_DATABASE_URL,
})

// Create and export the auth instance
export const auth = betterAuth({
  database: {
    dialect: new PostgresDialect({
      pool,
    }),
    type: 'postgres',
  },
  emailAndPassword: {
    enabled: true,
  },
  user: {
    modelName: 'users',
  },
  session: {
    modelName: 'sessions',
  },
  account: {
    modelName: 'accounts',
  },
  verification: {
    modelName: 'user_verifications',
  },
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path.startsWith('/sign-up')) {
        const session = ctx.context.newSession
        const user = session?.user
        // Create a default organization for new users
        if (user) {
          try {
            // Import the db instance from server-side
            const { db } = await import('~/utils/db')

            // Create a new organization for the user
            const [organization] = await db
              .insertInto('organizations')
              .values({ name: `${user.name}'s Organization` })
              .returning(['id', 'name', 'created_at', 'updated_at'])
              .execute()

            // Add the user as an admin to the organization
            await db
              .insertInto('memberships')
              .values({ user_id: user.id, organization_id: organization.id, role: 'admin' })
              .execute()
          }
          catch (error) {
            console.error('Failed to create organization for new user:', error)
          }
        }
      }
    }),
  },
  // You can add social providers if needed
  // socialProviders: {
  //   github: {
  //     clientId: process.env.GITHUB_CLIENT_ID,
  //     clientSecret: process.env.GITHUB_CLIENT_SECRET,
  //   }
  // }
})
