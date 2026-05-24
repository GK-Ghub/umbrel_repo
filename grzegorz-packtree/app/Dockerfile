# Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# Build Backend
FROM node:20-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend/ .
# Copy frontend build to the backend's public directory
COPY --from=frontend-builder /app/frontend/dist ./public

EXPOSE 4000
ENV PORT=4000
ENV NODE_ENV=production

CMD ["node", "src/index.js"]
