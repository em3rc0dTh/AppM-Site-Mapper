FROM node:22-alpine
WORKDIR /opt/site-mapper
COPY infra/modbus-tcp/server.mjs ./server.mjs
COPY infra/modbus-tcp/register-map.mjs ./register-map.mjs
COPY infra/modbus-tcp/point-registry.mjs ./point-registry.mjs
RUN mkdir -p /data && chown node:node /data
USER node
CMD ["node", "server.mjs"]
