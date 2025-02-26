import type { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // Create users table
  await db.schema
    .createTable('users')
    .addColumn('id', 'text', col => col.primaryKey().notNull())
    .addColumn('name', 'text', col => col.notNull())
    .addColumn('email', 'text', col => col.notNull().unique())
    .addColumn('emailVerified', 'boolean', col => col.notNull())
    .addColumn('image', 'text')
    .addColumn('createdAt', 'timestamp', col => col.notNull())
    .addColumn('updatedAt', 'timestamp', col => col.notNull())
    .execute()

  // Create sessions table
  await db.schema
    .createTable('sessions')
    .addColumn('id', 'text', col => col.primaryKey().notNull())
    .addColumn('expiresAt', 'timestamp', col => col.notNull())
    .addColumn('token', 'text', col => col.notNull().unique())
    .addColumn('createdAt', 'timestamp', col => col.notNull())
    .addColumn('updatedAt', 'timestamp', col => col.notNull())
    .addColumn('ipAddress', 'text')
    .addColumn('userAgent', 'text')
    .addColumn('userId', 'text', col => col.notNull().references('users.id'))
    .execute()

  // Create accounts table
  await db.schema
    .createTable('accounts')
    .addColumn('id', 'text', col => col.primaryKey().notNull())
    .addColumn('accountId', 'text', col => col.notNull())
    .addColumn('providerId', 'text', col => col.notNull())
    .addColumn('userId', 'text', col => col.notNull().references('users.id'))
    .addColumn('accessToken', 'text')
    .addColumn('refreshToken', 'text')
    .addColumn('idToken', 'text')
    .addColumn('accessTokenExpiresAt', 'timestamp')
    .addColumn('refreshTokenExpiresAt', 'timestamp')
    .addColumn('scope', 'text')
    .addColumn('password', 'text')
    .addColumn('createdAt', 'timestamp', col => col.notNull())
    .addColumn('updatedAt', 'timestamp', col => col.notNull())
    .execute()

  // Create user_verifications table
  await db.schema
    .createTable('user_verifications')
    .addColumn('id', 'text', col => col.primaryKey().notNull())
    .addColumn('identifier', 'text', col => col.notNull())
    .addColumn('value', 'text', col => col.notNull())
    .addColumn('expiresAt', 'timestamp', col => col.notNull())
    .addColumn('createdAt', 'timestamp')
    .addColumn('updatedAt', 'timestamp')
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop tables in reverse order
  await db.schema.dropTable('user_verifications').execute()
  await db.schema.dropTable('accounts').execute()
  await db.schema.dropTable('sessions').execute()
  await db.schema.dropTable('users').execute()
}
