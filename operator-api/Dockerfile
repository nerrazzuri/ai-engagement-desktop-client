# =========================
# Build stage
# =========================
FROM node:20-alpine AS build

WORKDIR /app

# Install deps
COPY package*.json ./
RUN npm ci

# Prisma
COPY prisma ./prisma
RUN npx prisma generate

# Build TS
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# =========================
# Runtime stage
# =========================
FROM node:20-alpine

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "dist/index.js"]
