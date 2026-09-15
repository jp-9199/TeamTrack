FROM node:22-alpine AS builder

WORKDIR /app

# Copy package descriptors
COPY package*.json ./
COPY tsconfig*.json ./

# Copy workspaces configuration
COPY packages/ ./packages/
COPY services/backend/ ./services/backend/

# Install dependencies deterministically
RUN npm ci

# Build shared packages
RUN npm run build:packages

# Build backend (compiles TS to dist/)
RUN npm run --workspace=@teamtrack/backend build

# Prune dev dependencies for the final image
RUN npm ci --omit=dev && npm cache clean --force

# -------------------------
# Production Runner Stage
# -------------------------
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 backenduser

# Copy production dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy compiled shared packages (since they are linked in node_modules, 
# but their actual files need to be copied for the symlinks to work, or 
# npm ci links them. Actually, copying the whole packages folder is safest).
COPY --from=builder /app/packages ./packages

# Copy backend files
COPY --from=builder /app/services/backend/package.json ./services/backend/package.json
COPY --from=builder /app/services/backend/dist ./services/backend/dist

# Ensure the non-root user owns the app
RUN chown -R backenduser:nodejs /app

USER backenduser

# The application port
EXPOSE 4000

# Run the server
CMD ["node", "services/backend/dist/server.js"]
