# Nuxt 3 + AI Agent Monorepo

This is a monorepo containing a Nuxt 3 web application and an autonomous AI agent CLI.

## Projects

### apps/web
Nuxt 3 marketing site with BetterAuth authentication, Kysely database access, and Tailwind CSS styling.

```bash
# Development
pnpm dev

# Build
pnpm build

# Tests
pnpm test
```

### packages/aso-agent
Autonomous AI agent that runs overnight, self-orchestrates through planning/implementation/review cycles, and maintains a `notes.yaml` as source of truth.

```bash
# Quick start
npx aso-agent "your objective" --stop-when "your stop condition"

# With debug logging
npx aso-agent "your objective" --stop-when "your stop condition" --debug

# See full documentation
cd packages/aso-agent && cat README.md
```

## Setup

```bash
# Install all dependencies
pnpm install

# Build all packages
pnpm build
```

## Running the Agent in Docker (Recommended)

For security isolation, run the agent in a Docker container:

```bash
# Build the image
docker build -t aso-agent .

# Run on current directory
docker run -it --rm \
  -v $(pwd):/workspace \
  -w /workspace \
  aso-agent \
  "your objective" \
  --stop-when "your stop condition"
```

The Dockerfile uses Alpine Linux and automatically installs OpenCode. Notes are persisted to your host filesystem via the volume mount.

See `packages/aso-agent/README.md` for full Docker documentation.

## Development

```bash
# Run web app
pnpm dev

# Run tests
pnpm test

# Lint
pnpm lint
```

## License

MIT
