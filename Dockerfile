# -------- Build stage --------
FROM --platform=$BUILDPLATFORM node:22 AS builder
WORKDIR /appointly

# Public/build-time args
ARG NEXT_PUBLIC_WEBAPP_URL
ARG NEXT_PUBLIC_API_V2_URL
ARG NEXT_PUBLIC_LICENSE_CONSENT
ARG NEXT_PUBLIC_WEBSITE_TERMS_URL
ARG NEXT_PUBLIC_WEBSITE_PRIVACY_POLICY_URL
ARG CALCOM_TELEMETRY_DISABLED
ARG MAX_OLD_SPACE_SIZE=16384

# Secrets / server env also needed at build
ARG NEXTAUTH_SECRET
ARG CALENDSO_ENCRYPTION_KEY
ARG DATABASE_URL

# Email
ARG EMAIL_SERVER_HOST
ARG EMAIL_SERVER_PORT
ARG EMAIL_SERVER_USER
ARG EMAIL_SERVER_PASSWORD

# Easebuzz
ARG EASEBUZZ_MERCHANT_KEY
ARG EASEBUZZ_KEY
ARG EASEBUZZ_SALT
ARG EASEBUZZ_ENV
ARG EASEBUZZ_BASE_URL
ARG EASEBUZZ_REFUND_BASE_URL
ARG CANCELLATION_REFUND_PERCENTAGE

# Push / JWT / Redis (only if referenced during build)
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG VAPID_PRIVATE_KEY
ARG JWT_SECRET
ARG REDIS_URL

# Expose all vars to next build
ENV NEXT_PUBLIC_WEBAPP_URL=${NEXT_PUBLIC_WEBAPP_URL} \
    NEXT_PUBLIC_API_V2_URL=${NEXT_PUBLIC_API_V2_URL} \
    NEXT_PUBLIC_LICENSE_CONSENT=${NEXT_PUBLIC_LICENSE_CONSENT} \
    NEXT_PUBLIC_WEBSITE_TERMS_URL=${NEXT_PUBLIC_WEBSITE_TERMS_URL} \
    NEXT_PUBLIC_WEBSITE_PRIVACY_POLICY_URL=${NEXT_PUBLIC_WEBSITE_PRIVACY_POLICY_URL} \
    CALCOM_TELEMETRY_DISABLED=${CALCOM_TELEMETRY_DISABLED} \
    NODE_OPTIONS=--max-old-space-size=${MAX_OLD_SPACE_SIZE} \
    BUILD_STANDALONE=true \
    NEXTAUTH_SECRET=${NEXTAUTH_SECRET} \
    CALENDSO_ENCRYPTION_KEY=${CALENDSO_ENCRYPTION_KEY} \
    DATABASE_HOST=${DATABASE_HOST} \
    DATABASE_URL=${DATABASE_URL} \
    DATABASE_DIRECT_URL=${DATABASE_URL} \
    DATABASE_READ_URL=${DATABASE_URL} \
    DATABASE_WRITE_URL=${DATABASE_URL} \
    EMAIL_SERVER_HOST=${EMAIL_SERVER_HOST} \
    EMAIL_SERVER_PORT=${EMAIL_SERVER_PORT} \
    EMAIL_SERVER_USER=${EMAIL_SERVER_USER} \
    EMAIL_SERVER_PASSWORD=${EMAIL_SERVER_PASSWORD} \
    EASEBUZZ_MERCHANT_KEY=${EASEBUZZ_MERCHANT_KEY} \
    EASEBUZZ_KEY=${EASEBUZZ_KEY} \
    EASEBUZZ_SALT=${EASEBUZZ_SALT} \
    EASEBUZZ_ENV=${EASEBUZZ_ENV} \
    EASEBUZZ_BASE_URL=${EASEBUZZ_BASE_URL} \
    EASEBUZZ_REFUND_BASE_URL=${EASEBUZZ_REFUND_BASE_URL} \
    CANCELLATION_REFUND_PERCENTAGE=${CANCELLATION_REFUND_PERCENTAGE} \
    NEXT_PUBLIC_VAPID_PUBLIC_KEY=${NEXT_PUBLIC_VAPID_PUBLIC_KEY} \
    VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY} \
    JWT_SECRET=${JWT_SECRET} \
    REDIS_URL=${REDIS_URL}

# Copy sources
COPY package.json yarn.lock .yarnrc.yml playwright.config.ts turbo.json i18n.json ./
COPY .yarn ./.yarn
COPY apps/web ./apps/web
COPY apps/api/v1 ./apps/api/v1
COPY apps/api/v2 ./apps/api/v2
COPY packages ./packages
COPY tests ./tests
COPY scripts ./scripts

# Install & build
RUN yarn config set httpTimeout 1200000
RUN npx turbo prune --scope=@calcom/web --scope=@calcom/trpc --docker
RUN yarn install --mode=skip-build
ENV DATABASE_URL=${DATABASE_URL}
RUN yarn workspace @calcom/prisma run post-install
RUN yarn prisma generate
RUN yarn workspace @calcom/trpc run build
RUN yarn --cwd packages/embeds/embed-core workspace @calcom/embed-core run build
RUN NODE_OPTIONS="--max-old-space-size=${MAX_OLD_SPACE_SIZE} --no-warnings" yarn workspace @calcom/web build
RUN rm -rf node_modules/.cache .yarn/cache apps/web/.next/cache

# -------- Slim copy stage --------
FROM node:22 AS builder-two
WORKDIR /appointly
ARG NEXT_PUBLIC_WEBAPP_URL
ENV NODE_ENV=production
COPY ../package.json ../.yarnrc.yml ../turbo.json ../i18n.json ./
COPY ../.yarn ./.yarn
COPY --from=builder /appointly/yarn.lock ./yarn.lock
COPY --from=builder /appointly/node_modules ./node_modules
COPY --from=builder /appointly/packages ./packages
COPY --from=builder /appointly/apps/web ./apps/web
COPY --from=builder /appointly/packages/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=builder /appointly/scripts ./scripts

RUN apt-get update && apt-get install -y postgresql-client && rm -rf /var/lib/apt/lists/*

ENV NEXT_PUBLIC_WEBAPP_URL=${NEXT_PUBLIC_WEBAPP_URL} \
    BUILT_NEXT_PUBLIC_WEBAPP_URL=${NEXT_PUBLIC_WEBAPP_URL}

RUN scripts/replace-placeholder.sh http://NEXT_PUBLIC_WEBAPP_URL_PLACEHOLDER ${NEXT_PUBLIC_WEBAPP_URL}

# -------- Runtime stage --------
FROM node:22 AS runner
WORKDIR /appointly

# Install Postgres client to use pg_isready in start.sh
RUN apt-get update && apt-get install -y postgresql-client && rm -rf /var/lib/apt/lists/*

COPY --from=builder-two /appointly ./
ARG NEXT_PUBLIC_WEBAPP_URL
ENV NODE_ENV=production \
    NEXT_PUBLIC_WEBAPP_URL=${NEXT_PUBLIC_WEBAPP_URL} \
    BUILT_NEXT_PUBLIC_WEBAPP_URL=${NEXT_PUBLIC_WEBAPP_URL}

EXPOSE 3000

RUN chmod +x /appointly/scripts/start.sh /appointly/scripts/replace-placeholder.sh /appointly/scripts/init-db.sh

HEALTHCHECK --interval=30s --timeout=30s --retries=5 \
  CMD wget --spider http://localhost:3000 || exit 1

CMD ["/appointly/scripts/start.sh"]
