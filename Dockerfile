FROM node:20-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY portal/package.json portal/package.json
COPY server/package.json server/package.json
RUN npm ci

COPY portal portal
COPY server server
RUN npm run build --workspace portal

FROM node:20-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/portal/dist ./portal/dist
COPY --from=build /app/server ./server

EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "server"]
