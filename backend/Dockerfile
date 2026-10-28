FROM node:24-bookworm-slim

ENV NODE_ENV=production PORT=3000
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node app.js server.js migrate.js ./
COPY --chown=node:node migrations ./migrations

USER node
EXPOSE 3000
CMD ["node", "server.js"]
