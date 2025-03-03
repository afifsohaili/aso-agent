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
