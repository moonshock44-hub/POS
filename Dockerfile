# Multi-stage build: compile the React (Vite) frontend, then serve it
# together with the FastAPI backend from a single container/process.
# Fits a single Fly.io app — no separate static host, no cross-origin cookies.

FROM node:22-slim AS frontend-build
WORKDIR /app/frontend
COPY app/frontend/package.json app/frontend/package-lock.json ./
RUN npm ci
COPY app/frontend/ ./
# Same-origin deploy: leave VITE_API_URL unset so the SPA calls relative /api/*
RUN npm run build

FROM python:3.11-slim AS backend
WORKDIR /app/backend
COPY app/backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app/backend/ ./
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

EXPOSE 8000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
