FROM node:22-alpine AS build

ARG DATABASE_DIRECT_URL
ARG DATABASE_URL

WORKDIR /calcom

RUN set -eux;
# fix openssl if needed on alpine
RUN ln -s /usr/lib/libssl.so.3 /lib/libssl.so.3 || true

ENV NODE_ENV="production"
ENV NODE_OPTIONS="--max-old-space-size=8192"
ENV DATABASE_DIRECT_URL=${DATABASE_DIRECT_URL}
ENV DATABASE_URL=${DATABASE_URL}
ENV PORT=80

COPY . .

# Install dependencies with peer dependency handling
ENV YARN_ENABLE_IMMUTABLE_INSTALLS=false
RUN yarn install --mode=skip-build

# Generate Prisma/client etc. (uses DATABASE_URL)
RUN yarn workspace @calcom/api-v2 run generate-schemas

# Ensure workspace node_modules is fresh after generate
RUN rm -rf apps/api/v2/node_modules
RUN yarn install --mode=skip-build

# Build NestJS app
RUN yarn workspace @calcom/api-v2 run build

EXPOSE 80

CMD [ "yarn", "workspace", "@calcom/api-v2", "start:prod" ]
