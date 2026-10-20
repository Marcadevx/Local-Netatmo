FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node src ./src
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV NODE_ENV=production
CMD ["node", "src/server.js"]
