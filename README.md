# 🚀 Lighthouse Docker

A lightweight, containerized Google Lighthouse audit service built on Alpine Linux with Node.js. Run web performance audits through a simple web interface or REST API.

[![Docker Hub](https://img.shields.io/badge/docker-saeedp%2Flighthouse--docker-blue)](https://hub.docker.com/r/saeedp/lighthouse-docker)
[![Version](https://img.shields.io/badge/version-1.1.0-green)](https://github.com/yourusername/lighthouse-docker)

## ✨ Features

- **Web Interface**: User-friendly form to run Lighthouse audits
- **REST API**: JSON endpoints for programmatic access
- **Multiple Output Formats**: HTML reports, full JSON, or filtered metrics
- **Selective Metrics**: Query specific performance metrics (Speed Index, FCP, LCP, etc.)
- **Alpine-based**: Minimal image size with Node:alpine and Chromium
- **Latest Versions**: Always uses latest Lighthouse, Node.js, and Chrome
- **Docker Ready**: Easy deployment with Docker Compose
- **Version Display**: Shows current version in footer

## 📋 Requirements

- Docker Desktop (Windows/Mac) or Docker Engine (Linux)
- Docker Compose

## 🚀 Quick Start

### 1. Clone or Download

```bash
git clone <your-repo-url>
cd lighthouse-docker
```

### 2. Start the Service

```bash
docker-compose up --build
```

The service will be available at `http://localhost:3000`

### 3. Run an Audit

Open your browser and navigate to:
```
http://localhost:3000
```

## 📖 Usage

### Web Interface

1. Open `http://localhost:3000` in your browser
2. Enter the URL you want to audit
3. Select output format:
   - **HTML Report**: Full interactive Lighthouse report
   - **JSON (All Data)**: Complete JSON response with all metrics
   - **JSON (Key Metrics Only)**: Filtered response with selected metrics
4. For metrics mode, select specific metrics you want
5. Click "Run Audit"

### API Endpoints

#### Debug Site Connectivity (New!)

```bash
curl "http://localhost:3000/debug/check?url=https://example.com"
```

Tests DNS, ping, port connectivity, and HTTP/HTTPS access. Useful for diagnosing connection issues before running audits.

#### Get HTML Report

```bash
curl "http://localhost:3000/analyze?url=https://example.com"
```

#### Get Full JSON Report

```bash
curl "http://localhost:3000/api/analyze?url=https://example.com"
```

**Response:**
```json
{
  "url": "https://example.com",
  "fetchTime": "2026-01-19T...",
  "categories": {
    "performance": 95,
    "accessibility": 98,
    "bestPractices": 92,
    "seo": 100
  },
  "audits": {
    "speedIndex": 1234.56,
    "firstContentfulPaint": 987.65,
    "largestContentfulPaint": 1500.23,
    "timeToInteractive": 2000.45,
    "totalBlockingTime": 150.32,
    "cumulativeLayoutShift": 0.05
  },
  "fullReport": { ... }
}
```

#### Get Specific Metrics Only

```bash
curl "http://localhost:3000/api/analyze?url=https://example.com&metrics=speed-index,fcp,lcp"
```

**Response:**
```json
{
  "url": "https://example.com",
  "fetchTime": "2026-01-19T...",
  "metrics": {
    "speed-index": 1234.56,
    "fcp": 987.65,
    "lcp": 1500.23
  }
}
```

### Available Metrics

**Category Scores (0-100):**
- `performance` - Performance score
- `accessibility` - Accessibility score
- `best-practices` - Best practices score
- `seo` - SEO score

**Performance Metrics (milliseconds or numeric):**
- `speed-index` - Speed Index
- `fcp` - First Contentful Paint
- `lcp` - Largest Contentful Paint
- `tti` - Time to Interactive
- `tbt` - Total Blocking Time
- `cls` - Cumulative Layout Shift

## 🛠️ Development

### Project Structure

```
lighthouse-docker/
├── docker-compose.yml    # Docker Compose configuration
├── Dockerfile           # Container build instructions
├── package.json         # Node.js dependencies
├── server.js           # Express server & Lighthouse runner
└── README.md           # This file
```

### Making Changes

The `server.js` file is mounted as a volume, so changes are reflected immediately:

1. Edit `server.js`
2. Restart the container: `docker-compose restart`
3. No rebuild needed!

For dependency or Dockerfile changes:
```bash
docker-compose up --build
```

### Technology Stack

- **Base Image**: `node:alpine` (latest)
- **Runtime**: Node.js (latest)
- **Browser**: Chromium (latest from Alpine repos)
- **Lighthouse**: Latest version
- **Process Manager**: dumb-init
- **Web Framework**: Express

## 🐳 Docker Hub Publishing

### Prepare for Publishing

1. **Login to Docker Hub:**
```bash
docker login
```

2. **Build the Image:**
```bash
docker build -t yourusername/lighthouse-docker:latest .
```

3. **Tag with Version:**
```bash
docker build -t yourusername/lighthouse-docker:1.0.0 .
docker tag yourusername/lighthouse-docker:1.0.0 yourusername/lighthouse-docker:latest
```

4. **Push to Docker Hub:**
```bash
docker push yourusername/lighthouse-docker:1.0.0
docker push yourusername/lighthouse-docker:latest
```

### Using the Published Image

Once published, others can use your image directly:

**docker-compose.yml:**
```yaml
services:
  lighthouse:
    image: yourusername/lighthouse-docker:latest
    container_name: lighthouse_docker
    ports:
      - "3000:3000"
    cap_add:
      - SYS_ADMIN
```

**Or with Docker run:**
```bash
docker run -d -p 3000:3000 --cap-add=SYS_ADMIN yourusername/lighthouse-docker:latest
```

**Coolify Deployment:**
- Image: `yourusername/lighthouse-docker:latest` (without "docker pull")
- Port: `3000`
- Add capability: `SYS_ADMIN`

### Multi-Platform Builds (Optional)

For ARM and AMD64 support:

```bash
docker buildx create --use
docker buildx build --platform linux/amd64,linux/arm64 \
  -t yourusername/lighthouse-docker:latest \
  -t yourusername/lighthouse-docker:1.0.0 \
  --push .
```

## ⚙️ Configuration

### Environment Variables

All environment variables are configurable via Coolify UI (both Dockerfile and Docker Compose build packs).

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port to listen on | `3000` |
| `CHROME_PATH` | Path to Chromium binary | `/usr/bin/chromium` |
| `MAX_REDIRECTS` | Maximum number of redirects to follow before running audit | `10` |
| `LIGHTHOUSE_TIMEOUT` | Lighthouse audit timeout in milliseconds | `180000` (3 min) |
| `DEFAULT_DEVICE` | Default device for audits (`mobile` or `desktop`) | `mobile` |
| `LOG_LEVEL` | Lighthouse log level (`silent`, `error`, `info`, `verbose`) | `info` |
| `PAGE_TITLE` | Custom title for the web interface | `Lighthouse Audit Tool` |
| `ENABLE_HTTP_FALLBACK` | Enable HTTP fallback checkbox by default (`true`/`false`) | `false` |
| `EXTRA_CHROME_FLAGS` | Additional Chrome flags (comma-separated) | `` |
| `NODE_TLS_REJECT_UNAUTHORIZED` | SSL certificate verification (`0` to disable) | `0` |

### Coolify Deployment - Dockerfile Build Pack

When using the **Dockerfile** build pack in Coolify, environment variables are configured via the UI and automatically injected as `ARG` values during build. The Dockerfile includes:

```dockerfile
# Build arguments for Coolify (automatically injected)
ARG PORT=3000
ARG MAX_REDIRECTS=10
ARG LIGHTHOUSE_TIMEOUT=180000
ARG DEFAULT_DEVICE=mobile
ARG LOG_LEVEL=info
ARG PAGE_TITLE="Lighthouse Audit Tool"
ARG ENABLE_HTTP_FALLBACK=false
ARG EXTRA_CHROME_FLAGS=""

# Set environment variables from build args
ENV PORT=${PORT}
ENV MAX_REDIRECTS=${MAX_REDIRECTS}
# ... etc
```

Simply add environment variables in Coolify's **Environment Variables** tab, and they will be used during the build.

### Coolify Deployment - Docker Compose Build Pack

The docker-compose.yml is configured for Coolify. Environment variables using `${VAR:-default}` syntax will appear in Coolify's Environment Variables UI:

```yaml
services:
  lighthouse:
    image: saeedp/lighthouse-docker:latest
    ports:
      - "3000:3000"
    environment:
      # These will appear in Coolify's Environment Variables UI
      - PORT=${PORT:-3000}
      - MAX_REDIRECTS=${MAX_REDIRECTS:-10}
      - LIGHTHOUSE_TIMEOUT=${LIGHTHOUSE_TIMEOUT:-180000}
      - DEFAULT_DEVICE=${DEFAULT_DEVICE:-mobile}
      - LOG_LEVEL=${LOG_LEVEL:-info}
      - PAGE_TITLE=${PAGE_TITLE:-Lighthouse Audit Tool}
      - ENABLE_HTTP_FALLBACK=${ENABLE_HTTP_FALLBACK:-false}
      - EXTRA_CHROME_FLAGS=${EXTRA_CHROME_FLAGS}
    cap_add:
      - SYS_ADMIN
    shm_size: '2gb'
```

**How Coolify detects variables:**
- `${VAR:-default}` → Shows in UI with default value pre-filled
- `${VAR}` → Shows in UI as uninitialized (empty)
- `VAR=value` → Hardcoded, NOT shown in UI

### Example: Custom Chrome Flags

Add extra Chrome flags via `EXTRA_CHROME_FLAGS` (comma-separated):

```bash
EXTRA_CHROME_FLAGS=--disable-web-security,--allow-file-access-from-files,--disable-popup-blocking
```

### Example docker-compose.yml with custom settings

```yaml
services:
  lighthouse:
    image: saeedp/lighthouse-docker:latest
    container_name: lighthouse_docker
    ports:
      - "8080:8080"
    environment:
      - PORT=8080
      - MAX_REDIRECTS=5
      - LIGHTHOUSE_TIMEOUT=300000  # 5 minutes
      - DEFAULT_DEVICE=desktop
      - LOG_LEVEL=verbose
      - PAGE_TITLE=My Company - Website Auditor
      - ENABLE_HTTP_FALLBACK=true
      - EXTRA_CHROME_FLAGS=--disable-web-security
    cap_add:
      - SYS_ADMIN
    shm_size: '2gb'
```

### Docker run with environment variables

```bash
docker run -d \
  -p 8080:8080 \
  -e PORT=8080 \
  -e MAX_REDIRECTS=5 \
  -e LIGHTHOUSE_TIMEOUT=300000 \
  -e DEFAULT_DEVICE=desktop \
  -e PAGE_TITLE="My Lighthouse Tool" \
  -e ENABLE_HTTP_FALLBACK=true \
  -e EXTRA_CHROME_FLAGS="--disable-web-security" \
  --cap-add=SYS_ADMIN \
  --shm-size=2gb \
  saeedp/lighthouse-docker:latest
```

### Chrome Flags

The following Chrome flags are used for stability in Docker:
- `--headless` - Run without UI
- `--no-sandbox` - Required for Docker
- `--disable-gpu` - Disable GPU hardware acceleration
- `--disable-dev-shm-usage` - Use /tmp instead of /dev/shm
- `--disable-setuid-sandbox` - Disable setuid sandbox
- `--ignore-certificate-errors` - Skip SSL certificate validation
- `--ignore-certificate-errors-spki-list` - Bypass certificate pinning
- `--allow-insecure-localhost` - Allow testing localhost with invalid certs
- `--disable-features=IsolateOrigins,site-per-process` - Bypass Chrome security interstitials
- `--allow-running-insecure-content` - Allow mixed content (HTTP on HTTPS)
- `--reduce-security-for-testing` - Reduce security restrictions for testing
- `--disable-web-security` - Disable web security features
- `--disable-blink-features=AutomationControlled` - Hide automation detection

**Warning**: These flags significantly reduce Chrome's security. Only use this tool for testing/development purposes.

## 🔧 Troubleshooting

### Browser Crashes

If you see "Browser tab has unexpectedly crashed":
- Ensure `SYS_ADMIN` capability is added in docker-compose.yml
- Check that all Chrome flags are present
- Verify sufficient memory allocation to Docker

### Navigation Performance Mark Error

If you see "The 'start lh:driver:navigate' performance mark has not been set":
- The target URL might be unreachable or very slow to load
- Check if the URL is accessible from the container
- Verify network connectivity
- Try with a simpler, faster-loading URL first
- Check container logs for more details

### SSL Certificate Errors

If you see "net::ERR_CERT_DATE_INVALID" or certificate errors:
- The service includes `--ignore-certificate-errors` flag by default
- This allows testing sites with self-signed or expired certificates
- Note: Only use this for testing/internal sites, not production monitoring

**Critical: OpenSSL Certificate Verification Failures**

If you see this error in `wget` test:
```
error:0A000086:SSL routines:tls_post_process_server_certificate:certificate verify failed
```

This means the SSL certificate is **fundamentally broken** at the OpenSSL level:
- Certificate chain incomplete or invalid
- Server using outdated/broken SSL configuration
- Self-signed certificate without proper CA

**Test with wget:**
```bash
docker exec -it lighthouse_docker wget --no-check-certificate -T 10 https://your-site.com
```

**If wget fails even with `--no-check-certificate`:**
- The site's HTTPS is severely misconfigured
- SSL handshake cannot complete
- **Not fixable in Lighthouse** - requires server-side SSL repair

**Workaround:** Test the HTTP version (if available):
```bash
curl "http://localhost:3000/api/analyze?url=http://your-site.com"
```

### Chrome Interstitial / Page Load Too Slow

If you see "Chrome prevented page load with an interstitial" or "page loaded too slowly":

**Current Timeout Settings:**
- Page load timeout: **180 seconds (3 minutes)**
- First Contentful Paint: **60 seconds (1 minute)**
- Network/CPU quiet thresholds: **1 second**

**Common Scenarios:**

1. **Site with Many Slow Resources:**
   - Logs show many "inflight" requests (unfinished resources)
   - Google Fonts, external scripts, or images timing out
   - **Solution:** Site may need optimization (CDN, image compression, etc.)

2. **Chrome Interstitial Error:**
   - Error: "Provided URL did not match initial navigation URL (chrome-error://chromewebdata/)"
   - Site loads but times out, Chrome shows error page
   - **Solution:** Wait longer or optimize site to load faster

3. **Genuine Site Issues:**
   - Resources genuinely taking 3+ minutes to load
   - Try testing a simpler page on the same domain
   - Check if site has bot protection or rate limiting

**Debug Commands:**

Test connectivity:
```bash
curl "http://localhost:3000/debug/check?url=https://your-site.com"
```

Test manually from container:
```bash
docker exec -it lighthouse_docker wget -T 30 -O- https://your-url.com
```

**Note:** If port 443 shows "open" but requests fail, it's typically a server-side SSL/TLS configuration issue - not fixable in the Lighthouse container.

### Port Already in Use

If port 3000 is already in use, change it in docker-compose.yml:
```yaml
ports:
  - "8080:3000"  # Use port 8080 instead
```

### Slow Builds

The Dockerfile is optimized for layer caching:
- Use `docker-compose up` (without `--build`) for code-only changes
- Only use `--build` when dependencies or Dockerfile change

### Audit Times Out

If audits are timing out:
- Increase Docker memory allocation (minimum 2GB recommended)
- Try auditing faster websites first
- Check if the target website has anti-bot protection
- Verify stable network connection

## 📝 License

MIT License - feel free to use and modify.

## 🤝 Contributing

Contributions are welcome! Feel free to submit issues and pull requests.

## 📊 Changelog

### v1.0.0 (2026-01-19)
- Initial release
- Web interface for running audits
- REST API endpoints for JSON responses
- Selective metrics filtering
- Alpine Linux base with latest Node and Lighthouse
- Volume mounting for rapid development
- Docker Hub ready configuration
