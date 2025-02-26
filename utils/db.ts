import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'

// Define your database schema types
export interface Database {
  // Define your tables here
  users: {
    id: string
    email: string
    created_at: Date
    updated_at: Date
    // Add other user fields as needed
  }
  organizations: {
    id: string
    name: string
    created_at: Date
    updated_at: Date
  }
  memberships: {
    id: string
    user_id: string
    organization_id: string
    role: 'admin' | 'member'
    created_at: Date
    updated_at: Date
  }
  // Add other tables as needed
}

// Create a PostgreSQL connection pool
const pool = new pg.Pool({
  connectionString: process.env.NUXT_DATABASE_URL,
})

// Create and export the Kysely database instance
export const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool,
  }),
})
