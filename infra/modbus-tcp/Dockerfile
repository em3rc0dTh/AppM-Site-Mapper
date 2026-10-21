FROM node:22-alpine
WORKDIR /opt/site-mapper
COPY infra/modbus-tcp/server.mjs ./server.mjs
COPY infra/modbus-tcp/register-map.mjs ./register-map.mjs
USER node
CMD ["node", "server.mjs"]
