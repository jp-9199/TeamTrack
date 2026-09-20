FROM node:22-alpine AS builder

WORKDIR /app

# Copy package configurations
COPY package*.json ./
COPY tsconfig*.json ./
COPY packages/ ./packages/
COPY services/backend/ ./services/backend/
COPY database/ ./database/

# Install dependencies for monorepo and backend
RUN npm ci --workspace=@teamtrack/backend --include-workspace-root

# Build packages and backend
RUN npm run build:packages
RUN npm run --workspace=@teamtrack/backend build

# --------------------------------------------------
# Production Runner Stage
# --------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

# Copy runtime artifacts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/database ./database
COPY --from=builder /app/services/backend/package.json ./services/backend/package.json
COPY --from=builder /app/services/backend/dist ./services/backend/dist

EXPOSE 4000

CMD ["node", "services/backend/dist/server.js"]
