FROM node:alpine

# Install Chromium, curl, and dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    udev \
    ttf-opensans \
    dumb-init \
    curl \
    openssl

# Set env for Chrome Launcher to find the binary
ENV CHROME_PATH=/usr/bin/chromium-browser
ENV CHROME_BIN=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Disable SSL certificate verification for broken SSL sites (multiple levels)
ENV NODE_TLS_REJECT_UNAUTHORIZED=0
ENV NODE_EXTRA_CA_CERTS=""
ENV SSL_CERT_DIR=/etc/ssl/certs
ENV REQUESTS_CA_BUNDLE=""
ENV CURL_CA_BUNDLE=""

# Build arguments for Coolify (automatically injected by Coolify)
ARG PORT=3000
ARG MAX_REDIRECTS=10
ARG LIGHTHOUSE_TIMEOUT=180000
ARG DEFAULT_DEVICE=mobile
ARG LOG_LEVEL=info
ARG PAGE_TITLE="Lighthouse Audit Tool"
ARG ENABLE_HTTP_FALLBACK=false
ARG EXTRA_CHROME_FLAGS=""

# Set environment variables from build args (for Coolify Dockerfile build pack)
ENV PORT=${PORT}
ENV MAX_REDIRECTS=${MAX_REDIRECTS}
ENV LIGHTHOUSE_TIMEOUT=${LIGHTHOUSE_TIMEOUT}
ENV DEFAULT_DEVICE=${DEFAULT_DEVICE}
ENV LOG_LEVEL=${LOG_LEVEL}
ENV PAGE_TITLE=${PAGE_TITLE}
ENV ENABLE_HTTP_FALLBACK=${ENABLE_HTTP_FALLBACK}
ENV EXTRA_CHROME_FLAGS=${EXTRA_CHROME_FLAGS}

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE ${PORT}

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD [ "node", "server.js" ]