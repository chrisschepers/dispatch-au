FROM node:24.20.0-bookworm-slim
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY lib/incidents.ts /app/lib/incidents.ts
COPY backend/*.mjs ./
ENV NODE_ENV=production
ENV DATABASE_PATH=/data/incidents.sqlite
EXPOSE 8080
CMD ["npm", "start"]
