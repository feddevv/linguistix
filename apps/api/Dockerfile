FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable pnpm

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install

FROM dependencies AS builder
COPY apps/api ./apps/api
COPY packages/shared ./packages/shared
RUN pnpm --filter api build

FROM base AS runner
RUN pnpm prune --prod
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/dist/ ./apps/api/dist/
COPY --from=builder /app/apps/api/migrations ./apps/api/migrations
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/packages/ ./packages/
EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]