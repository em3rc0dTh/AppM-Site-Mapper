FROM node:22-alpine
WORKDIR /app
COPY infra/operational-console/package.json ./package.json
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund
COPY infra/operational-console/server.mjs ./server.mjs
COPY infra/operational-console/live.mjs ./live.mjs
USER node
EXPOSE 3100
CMD ["node","server.mjs"]
