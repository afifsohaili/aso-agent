import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'

export function useDatabase(env: { databaseUrl: string }) {
  const pool = new pg.Pool({
    connectionString: env.databaseUrl,
  })

  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  })
}

export async function testDatabase(config: any): Promise<boolean> {
  try {
    const db = useDatabase(config)
    await db.selectFrom('accounts').select('id').limit(1).execute()
    return true
  }
  catch (error) {
    console.error('Database health check failed:', error)
    return false
  }
}
