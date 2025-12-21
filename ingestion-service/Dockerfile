FROM node:20-bullseye

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma/
RUN npx prisma generate

COPY . .


RUN npm run build
# Explicitly copy rules to dist (since tsc doesn't)
# Explicitly copy signals to dist (since tsc doesn't)
COPY src/services/brain/intent/signals ./dist/services/brain/intent/signals

EXPOSE 3005

CMD ["npm", "run", "start"]
