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

## Icons
- Use `unplugin-icons` for all icons (configured in nuxt.config.ts)
- Import icons with `~icons/` prefix: `import BellIcon from '~icons/heroicons/bell'`
- Use the imported component directly: `<BellIcon class="h-6 w-6" />`
- Available icon sets: heroicons, lucide, mdi, and more
- **Do NOT use inline SVGs, `<img>` tags for icons, or other icon libraries directly**

## Tools
- Use web_search MCP to search the web for information
- Use browser MCP to check the application state and take actions

## Testing
- **Integration tests are preferred** over unit tests for testing API endpoints and full feature flows
- Use `@nuxt/test-utils/e2e` for API route testing with real HTTP calls
- Tests can run in two modes:
  - **Fast mode** (recommended): Start dev server separately, then run tests with `TEST_HOST`:
    ```bash
    # Terminal 1: Start dev server
    pnpm dev --port 3001
    
    # Terminal 2: Run tests against running server
    TEST_HOST=http://localhost:3001 pnpm vitest run test/e2e/
    ```
  - **Slow mode** (isolated): Each test file starts its own server (takes ~20s per file):
    ```bash
    pnpm vitest run test/e2e/notifications.get.spec.ts
    ```
- All e2e test files should support `TEST_HOST` environment variable:
  ```typescript
  await setup({ host: process.env.TEST_HOST })
  ```

## Testing Tips
- Vitest swallows `console.log` output. Use `throw new Error(JSON.stringify(value))` to see values in test output instead.
