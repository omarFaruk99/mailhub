FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# `prisma generate` only reads the schema, but prisma.config.ts requires
# DATABASE_URL to resolve to *something* — no real database is needed yet.
# docker-compose overrides this with the real value at container run time.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate
RUN npm run build

EXPOSE 4000

# Applying already-applied migrations is a safe no-op, so running this on
# every start (not just the first) needs no separate manual step.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
