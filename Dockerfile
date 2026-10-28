FROM node:24-bookworm-slim AS frontend-build
WORKDIR /workspace
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci
COPY frontend ./frontend
ARG BASE_PATH=/
ENV BASE_PATH=${BASE_PATH}
RUN cd frontend && npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=3000 \
    COROS_ENABLED=false
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY --chown=1000:1000 backend/ .
COPY --from=frontend-build --chown=1000:1000 /workspace/frontend/dist ./app/static
USER 1000:1000
EXPOSE 3000
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-3000} --no-access-log"]
