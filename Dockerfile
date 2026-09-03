FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG BUILD_VERSION=dev
ARG BUILD_BRANCH=unknown
ARG BUILD_COMMIT=unknown
ENV NODE_ENV=production
ENV BUILD_VERSION=$BUILD_VERSION
ENV BUILD_BRANCH=$BUILD_BRANCH
ENV BUILD_COMMIT=$BUILD_COMMIT
EXPOSE 3000

CMD ["npm", "start"]
