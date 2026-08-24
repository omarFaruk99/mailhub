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

# Catches real type errors at build time. tsx (below) only strips types at
# runtime and never checks them, so without this step a broken build would
# ship straight to the live office SES account instead of failing here.
RUN npx tsc --noEmit

EXPOSE 4000

# Run via tsx, same as `npm run dev` — NOT the tsc-compiled dist/ output.
# The Prisma-generated client uses extensionless relative imports (assumes a
# bundler); Node's own ESM loader rejects those with ERR_MODULE_NOT_FOUND,
# while tsx's resolver (same one already proven by local dev) handles them.
#
# Applying already-applied migrations is a safe no-op, so running this on
# every start (not just the first) needs no separate manual step.
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx src/index.ts"]
