import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // Create organizations table
  await db.schema
    .createTable('organizations')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'varchar', col => col.notNull())
    .addColumn('created_at', 'timestamp', col => col.defaultTo(sql`now()`).notNull())
    .addColumn('updated_at', 'timestamp', col => col.defaultTo(sql`now()`).notNull())
    .execute()

  // Create memberships table (for many-to-many relationship)
  await db.schema
    .createTable('memberships')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'varchar', col => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('organization_id', 'uuid', col => col.notNull().references('organizations.id').onDelete('cascade'))
    .addColumn('role', 'varchar', col => col.notNull().defaultTo('member'))
    .addColumn('created_at', 'timestamp', col => col.defaultTo(sql`now()`).notNull())
    .addColumn('updated_at', 'timestamp', col => col.defaultTo(sql`now()`).notNull())
    .execute()

  // Add unique constraint to prevent duplicate memberships
  await db.schema
    .createIndex('memberships_user_org_unique')
    .on('memberships')
    .columns(['user_id', 'organization_id'])
    .unique()
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop tables in reverse order
  await db.schema.dropTable('memberships').execute()
  await db.schema.dropTable('organizations').execute()
}
