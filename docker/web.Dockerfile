FROM node:24.13.0-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@11.13.1 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @carhistory/validation build && pnpm --filter @carhistory/web build
FROM nginx:1.28-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
