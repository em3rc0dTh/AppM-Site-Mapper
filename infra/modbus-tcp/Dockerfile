FROM node:22-alpine
WORKDIR /opt/site-mapper
COPY infra/modbus-tcp/server.mjs ./server.mjs
USER node
CMD ["node", "server.mjs"]
