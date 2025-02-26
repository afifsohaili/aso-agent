import { db } from '../utils/db'
import { defineConfig } from 'kysely-ctl'

export default defineConfig({
  kysely: db,
  migrations: {
    migrationFolder: 'migrations',
  }
})
