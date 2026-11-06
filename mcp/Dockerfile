# etrink MCP server (stdio). Needs ETRINK_API_KEY at runtime.
FROM node:20-slim AS build
WORKDIR /app
COPY package.json build.mjs ./
COPY src ./src
RUN npm install --no-audit --no-fund && node build.mjs

FROM node:20-slim
WORKDIR /app
COPY --from=build /app/dist/etrink-mcp.mjs ./etrink-mcp.mjs
ENV ETRINK_API_BASE=https://api.etrink.com
USER node
ENTRYPOINT ["node", "etrink-mcp.mjs"]
