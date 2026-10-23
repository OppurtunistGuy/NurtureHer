FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 NOCTURNE_DB_PATH=/data/nocturne.sqlite
RUN mkdir /data && chown node:node /data
COPY --from=build --chown=node:node /app/.output ./.output
USER node
EXPOSE 3000
VOLUME ["/data"]
CMD ["node", ".output/server/index.mjs"]
