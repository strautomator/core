# BUILDER
FROM node:26-alpine AS strautomator-web-builder
WORKDIR /app
COPY . .
RUN apk add bash git openssh && git config --global init.defaultBranch master && npm install --prefer-online && npm run build

# FINAL IMAGE
FROM node:26-alpine AS strautomator-web-final
ENV NODE_ENV=production
ENV JSON_LOGGING=true
ENV HOST=0.0.0.0
WORKDIR /app
COPY . .
COPY --from=strautomator-web-builder ./app/.output ./.output

CMD ["node", "start.mjs"]
