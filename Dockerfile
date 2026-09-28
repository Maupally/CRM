FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production NODE_NO_WARNINGS=1 PORT=3000 PGLITE_DIR=/data/pglite
COPY package*.json ./
RUN npm ci --omit=dev && npm i --no-save tsx@4
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
VOLUME /data
EXPOSE 3000
CMD ["npx", "tsx", "server/index.ts"]
