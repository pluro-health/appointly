
FROM --platform=$BUILDPLATFORM node:22 AS builder


WORKDIR /appointly


ARG NEXT_PUBLIC_LICENSE_CONSENT
ARG NEXT_PUBLIC_WEBSITE_TERMS_URL
ARG NEXT_PUBLIC_WEBSITE_PRIVACY_POLICY_URL
ARG CALCOM_TELEMETRY_DISABLED
ARG DATABASE_URL
ARG NEXTAUTH_SECRET=secret
ARG CALENDSO_ENCRYPTION_KEY=secret
ARG MAX_OLD_SPACE_SIZE=16000
ARG NEXT_PUBLIC_API_V2_URL


ENV NEXT_PUBLIC_WEBAPP_URL=http://NEXT_PUBLIC_WEBAPP_URL_PLACEHOLDER \
   NEXT_PUBLIC_API_V2_URL=$NEXT_PUBLIC_API_V2_URL \
   NEXT_PUBLIC_LICENSE_CONSENT=$NEXT_PUBLIC_LICENSE_CONSENT \
   NEXT_PUBLIC_WEBSITE_TERMS_URL=$NEXT_PUBLIC_WEBSITE_TERMS_URL \
   NEXT_PUBLIC_WEBSITE_PRIVACY_POLICY_URL=$NEXT_PUBLIC_WEBSITE_PRIVACY_POLICY_URL \
   CALCOM_TELEMETRY_DISABLED=$CALCOM_TELEMETRY_DISABLED \
   DATABASE_URL=$DATABASE_URL \
   DATABASE_DIRECT_URL=$DATABASE_URL \
   NEXTAUTH_SECRET=${NEXTAUTH_SECRET} \
   CALENDSO_ENCRYPTION_KEY=${CALENDSO_ENCRYPTION_KEY} \
   NODE_OPTIONS=--max-old-space-size=${MAX_OLD_SPACE_SIZE} \
   BUILD_STANDALONE=true \
   # Need values
   EMAIL_SERVER_HOST= \
   EMAIL_SERVER_PORT= \
   EMAIL_SERVER_USER= \
   EMAIL_SERVER_PASSWORD= \
   EASEBUZZ_MERCHANT_KEY= \
   EASEBUZZ_KEY= \
   EASEBUZZ_SALT= \
   EASEBUZZ_ENV= \
   EASEBUZZ_BASE_URL= \
   EASEBUZZ_REFUND_BASE_URL= \
   CANCELLATION_REFUND_PERCENTAGE= \

COPY package.json yarn.lock .yarnrc.yml playwright.config.ts turbo.json i18n.json ./
COPY .yarn ./.yarn
COPY apps/web ./apps/web
COPY apps/api/v1 ./apps/api/v1
COPY apps/api/v2 ./apps/api/v2
COPY packages ./packages
COPY tests ./tests
COPY scripts ./scripts

RUN yarn config set httpTimeout 1200000
RUN npx turbo prune --scope=@calcom/web --scope=@calcom/trpc --docker
RUN yarn install --mode=skip-build
ENV DATABASE_URL=${DATABASE_URL}
RUN yarn workspace @calcom/prisma run post-install
RUN yarn prisma generate

# Build and make embed servable from web/public/embed folder
RUN yarn workspace @calcom/trpc run build
RUN yarn --cwd packages/embeds/embed-core workspace @calcom/embed-core run build
RUN NODE_OPTIONS="--max-old-space-size=${MAX_OLD_SPACE_SIZE} --no-warnings" yarn workspace @calcom/web build


# RUN yarn plugin import workspace-tools && \
#     yarn workspaces focus --all --production
RUN rm -rf node_modules/.cache .yarn/cache apps/web/.next/cache


FROM node:22 AS builder-two


WORKDIR /appointly
ARG NEXT_PUBLIC_WEBAPP_URL=http://localhost:3000


ENV NODE_ENV=production


COPY ../package.json ../.yarnrc.yml ../turbo.json ../i18n.json ./
COPY ../.yarn ./.yarn
COPY --from=builder /appointly/yarn.lock ./yarn.lock
COPY --from=builder /appointly/node_modules ./node_modules
COPY --from=builder /appointly/packages ./packages
COPY --from=builder /appointly/apps/web ./apps/web
COPY --from=builder /appointly/packages/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=builder /appointly/scripts ./scripts

# Install PostgreSQL client for database initialization
RUN apt-get update && apt-get install -y postgresql-client && rm -rf /var/lib/apt/lists/*

# Save value used during this build stage. If NEXT_PUBLIC_WEBAPP_URL and BUILT_NEXT_PUBLIC_WEBAPP_URL differ at
# run-time, then start.sh will find/replace static values again.
ENV NEXT_PUBLIC_WEBAPP_URL=$NEXT_PUBLIC_WEBAPP_URL \
   BUILT_NEXT_PUBLIC_WEBAPP_URL=$NEXT_PUBLIC_WEBAPP_URL


RUN scripts/replace-placeholder.sh http://NEXT_PUBLIC_WEBAPP_URL_PLACEHOLDER ${NEXT_PUBLIC_WEBAPP_URL}


FROM node:22 AS runner




WORKDIR /appointly
COPY --from=builder-two /appointly ./
ARG NEXT_PUBLIC_WEBAPP_URL=http://localhost:3000
ENV NEXT_PUBLIC_WEBAPP_URL=$NEXT_PUBLIC_WEBAPP_URL \
   BUILT_NEXT_PUBLIC_WEBAPP_URL=$NEXT_PUBLIC_WEBAPP_URL


ENV NODE_ENV=production
EXPOSE 3000


HEALTHCHECK --interval=30s --timeout=30s --retries=5 \
   CMD wget --spider http://localhost:3000 || exit 1


CMD ["/appointly/scripts/start.sh"]


