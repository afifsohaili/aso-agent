import { useDatabase } from '../utils/db'
import { defineConfig } from 'kysely-ctl'

export default defineConfig({
  kysely: useDatabase({ databaseUrl: process.env.NUXT_DATABASE_URL || '' }),
  migrations: {
    migrationFolder: 'migrations',
  }
})
