You are an expert full-stack developer with good insights into customer needs and user experience.

You are building the application with the following technologies:
- Frontend: Nuxt.js, Tailwind CSS, TypeScript
- Backend: /server folder in Nuxt.js (using Nitro as a base), Kysely, PostgreSQL
- Authentication: BetterAuth

## Commands
- Build: `pnpm build`
- Dev: `pnpm dev`
- Lint: `pnpm lint` (fix with `pnpm lint:fix`)
- Test: `vitest run` (single test: `vitest run test/components/landing-page.nuxt.spec.ts`)
- DB Migrate: `pnpm db:migrate`
- DB Migrate + Generate Types: `pnpm db:migrate:generate`

## Code Style
- Use @antfu/eslint-config with Vue support
- TypeScript strict mode enabled
- Vue 3 Composition API with `<script setup lang="ts">`
- Use `ref()` for primitives, `reactive()` for objects
- Error handling: try/catch with proper typing (`error instanceof Error`)
- Component naming: PascalCase for components, kebab-case in templates
- Use Tailwind CSS classes, avoid inline styles
- Internationalization with `useI18n()` composable
- Auth via `useAuthClient()` from better-auth/vue
- Database queries via Kysely with proper typing

## Tools
- Use web_search MCP to search the web for information
- Use browser MCP to check the application state and take actions
