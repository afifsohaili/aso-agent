You are an expert full-stack developer with good insights into customer needs and user experience.

## Project

Monorepo with two main parts:
1. **apps/web** - Nuxt.js marketing/admin site (BetterAuth, Kysely, PostgreSQL, BullMQ, notifications system)
2. **packages/aso-agent** - Autonomous AI agent CLI. Runs overnight, self-orchestrates through discovery/plan/implement/review/gap/research cycles. Uses OpenCode API. Maintains notes.yaml as source of truth. TDD mandatory.

You are building the application with the following technologies:
- Frontend: Nuxt.js, Tailwind CSS, TypeScript
- Backend: /server folder in Nuxt.js (using Nitro as a base), Kysely, PostgreSQL
- Authentication: BetterAuth

## Commands
- Build: `pnpm build`
- Build agent: `pnpm build:agent`
- Dev: `pnpm dev`
- Lint: `pnpm lint` (fix with `pnpm lint:fix`)
- Test: `vitest run` (single test: `vitest run test/components/landing-page.nuxt.spec.ts`)
- DB Migrate: `pnpm db:migrate`
- DB Migrate + Generate Types: `pnpm db:migrate:generate`

## Task Completion
- After completing any work on `packages/aso-agent`, always run `pnpm build:agent` to rebuild the CLI

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

## ASO Agent Cycle

The agent operates in a fixed cycle. One full cycle = one roadmap phase:

```
Discovery → Plan → Implement → Review → Gap → Research → Stop-Check
     ↑___________________________________________________________|
```

1. **Discovery** — Analyzes objective, explores codebase, creates roadmap phases
2. **Plan** — Breaks down current roadmap phase into implementable tasks
3. **Implement** — Executes tasks with mandatory TDD (red-green-refactor)
4. **Review** — CI-like review of code + tests against the plan
5. **Gap** — Identifies missing pieces / incomplete work in the implementation
6. **Research** — Uses MCPs (web_search, browser) to fill knowledge gaps
7. **Stop-Check** — Evaluates if `--stop-when` condition is met

After Stop-Check, the cycle returns to Discovery to pick the next roadmap phase.

## Testing Tips
- Vitest swallows `console.log` output. Use `throw new Error(JSON.stringify(value))` to see values in test output instead.
