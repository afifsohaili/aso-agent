import { betterAuth } from 'better-auth'
import pg from 'pg'
import { PostgresDialect } from 'kysely'

if (!process.env.NUXT_DATABASE_URL) {
  throw new Error('NUXT_DATABASE_URL is not set')
}

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
  // You can add social providers if needed
  // socialProviders: {
  //   github: {
  //     clientId: process.env.GITHUB_CLIENT_ID,
  //     clientSecret: process.env.GITHUB_CLIENT_SECRET,
  //   }
  // }
})
