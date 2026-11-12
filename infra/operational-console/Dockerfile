FROM node:22-alpine
WORKDIR /app
COPY --chmod=0644 infra/operational-console/package.json ./package.json
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund
COPY --chmod=0644 infra/operational-console/server.mjs ./server.mjs
COPY --chmod=0644 infra/operational-console/live.mjs ./live.mjs
USER node
RUN node -e "for (const file of ['server.mjs', 'live.mjs', 'package.json']) require('node:fs').readFileSync(file)"
EXPOSE 3100
CMD ["node","server.mjs"]
