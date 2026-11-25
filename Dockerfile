FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4173
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist/client ./dist/client
COPY --from=builder /app/dist/server.mjs ./dist/server.mjs
USER node
EXPOSE 4173
CMD ["npm", "start"]
