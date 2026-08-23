FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npx prisma generate
RUN npm run build

EXPOSE 4000

# Applying already-applied migrations is a safe no-op, so running this on
# every start (not just the first) needs no separate manual step.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
