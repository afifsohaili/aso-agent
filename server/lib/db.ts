import { Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'

// Define our database schema
export interface Database {
  organizations: OrganizationTable
  memberships: MembershipTable
  users: UserTable
}

export interface OrganizationTable {
  id: string
  name: string
  created_at: Date
  updated_at: Date
}

export interface MembershipTable {
  id: string
  user_id: string
  organization_id: string
  role: 'admin' | 'member'
  created_at: Date
  updated_at: Date
}

export interface UserTable {
  id: string
  email: string
  created_at: Date
  updated_at: Date
}

// Create a Kysely instance using PostgreSQL
const dialect = new PostgresDialect({
  pool: new Pool({
    connectionString: process.env.NUXT_DATABASE_URL,
  }),
})

// Export the database instance
export const db = new Kysely<Database>({
  dialect,
})
