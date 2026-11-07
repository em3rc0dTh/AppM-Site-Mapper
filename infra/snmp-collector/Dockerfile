FROM node:22.16.0-alpine
WORKDIR /app
COPY infra/snmp-collector/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY infra/snmp-collector/*.mjs ./
# The repository may be checked out under a restrictive umask (e.g. 077).
# Normalize runtime script permissions inside the image before dropping to USER node.
RUN chmod 0644 /app/*.mjs && mkdir -p /data && chown node:node /data
USER node
CMD ["node", "server.mjs"]
