FROM node:24-alpine

# Install git, curl, bash (required for install script), tar
RUN apk add --no-cache git curl bash tar ca-certificates

# Install OpenCode
RUN curl -fsSL https://opencode.ai/install | bash

# Install pnpm globally
RUN npm install -g pnpm@10.11.0

# Copy aso-agent package
COPY packages/aso-agent /aso-agent
WORKDIR /aso-agent

# Install dependencies (skip postinstall)
RUN pnpm install --ignore-scripts

# Build
RUN pnpm build

# Set environment
ENV PATH="/root/.opencode/bin:${PATH}"

# Set working directory for agent runs
WORKDIR /workspace

ENTRYPOINT ["node", "/aso-agent/dist/cli.js"]
