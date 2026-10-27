# Build from the repository root, as the web depends on the local core:
# docker build -f web/Dockerfile .

# BUILDER
FROM node:26-alpine AS strautomator-web-builder
WORKDIR /app
COPY core/ ./core/
COPY web/ ./web/
RUN cd core && npm ci --no-audit --no-fund
RUN cd web && npm ci --no-audit --no-fund && npm run build

# FINAL IMAGE
FROM node:26-alpine AS strautomator-web-final
ENV NODE_ENV=production
ENV JSON_LOGGING=true
ENV HOST=0.0.0.0
WORKDIR /app
COPY web/ .
COPY --from=strautomator-web-builder /app/web/.output ./.output

CMD ["node", "start.mjs"]
