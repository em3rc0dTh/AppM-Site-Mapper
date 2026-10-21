FROM node:22.16.0-alpine
WORKDIR /app
COPY infra/snmp-collector/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY infra/snmp-collector/*.mjs ./
USER node
CMD ["node", "server.mjs"]
