FROM node:24-bookworm-slim AS frontend-build
WORKDIR /workspace
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci
COPY frontend ./frontend
ARG BASE_PATH=/
ENV BASE_PATH=${BASE_PATH}
RUN cd frontend && npm run build

FROM node:24-bookworm-slim
ARG BASE_PATH=/
ENV NODE_ENV=production PORT=3000 BASE_PATH=${BASE_PATH}
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node backend/app.js backend/server.js backend/migrate.js ./
COPY --chown=node:node backend/migrations ./migrations
COPY --from=frontend-build --chown=node:node /workspace/frontend/dist ./app/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
