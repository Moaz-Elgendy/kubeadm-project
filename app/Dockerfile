FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# Set by Jenkins (--build-arg APP_VERSION=<BUILD_NUMBER>); shown in the UI footer.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "server.js"]
