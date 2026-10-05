FROM node:24.13.0-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.13.1 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm db:generate && pnpm --filter @carhistory/validation build && pnpm --filter @carhistory/api build
ENV NODE_ENV=production
USER node
CMD ["node", "apps/api/dist/worker.js"]
