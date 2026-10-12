FROM node:22-alpine AS base

WORKDIR /app

# better-sqlite3 uses node-gyp to build its native addon.
RUN apk add --no-cache python3 make g++

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN npm_config_nodedir=/usr/local pnpm install --frozen-lockfile
RUN node -e "const Database = require('better-sqlite3'); const db = new Database(':memory:'); db.prepare('SELECT 1').get(); db.close();"

# Copy source
COPY . .

# Build
RUN pnpm build

# Production stage
FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache libstdc++

RUN npm install -g pnpm

# Copy built app and dependencies from builder
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/.next ./.next
COPY --from=base /app/public ./public
COPY --from=base /app/package.json ./package.json

EXPOSE 3000

CMD ["pnpm", "start"]
