# PACCA IDP web app: the React SPA and the Express API in one image.
# Build:  docker build -t pacca-idp-web .
# Run:    docker run --env-file .env -p 3000:3000 pacca-idp-web

FROM node:22-slim AS build
WORKDIR /app
# pnpm version comes from package.json "packageManager".
RUN corepack enable
COPY package.json pnpm-lock.yaml .npmrc ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build && pnpm prune --prod

FROM node:22-slim
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# Read at runtime from process.cwd(): doc-type schemas and the Solutions catalog.
COPY --from=build --chown=node:node /app/analyzers ./analyzers
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
