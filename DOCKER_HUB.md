# Publishing to Docker Hub

This guide provides detailed instructions for publishing the Lighthouse Docker image to Docker Hub.

## Prerequisites

1. **Docker Hub Account**: Create a free account at [hub.docker.com](https://hub.docker.com)
2. **Docker Desktop**: Ensure Docker is installed and running
3. **Repository Access**: You need write access to your Docker Hub repository

## Step-by-Step Publishing Guide

### 1. Login to Docker Hub

Open your terminal and login:

```bash
docker login
```

Enter your Docker Hub username and password when prompted.

### 2. Build Your Image

Navigate to the project directory and build:

```bash
cd lighthouse-docker
docker build -t yourusername/lighthouse-docker:latest .
```

Replace `yourusername` with your actual Docker Hub username.

### 3. Tag with Version Number

It's a good practice to tag with both a specific version and `latest`:

```bash
docker tag saeedp/lighthouse-docker:latest saeedp/lighthouse-docker:1.0.0
```

Or build with multiple tags at once:

```bash
docker build -t saeedp/lighthouse-docker:1.0.0 -t saeedp/lighthouse-docker:latest .
```

### 4. Test Your Image Locally

Before pushing, verify the image works:

```bash
docker run -d -p 3000:3000 --cap-add=SYS_ADMIN yourusername/lighthouse-docker:latest
```

Open `http://localhost:3000` and test the service.

### 5. Push to Docker Hub

Push both tags:

```bash
docker push saeedp/lighthouse-docker:1.0.0
docker push saeedp/lighthouse-docker:latest
```

### 6. Verify on Docker Hub

1. Go to https://hub.docker.com/r/yourusername/lighthouse-docker
2. Verify both tags are visible
3. Check the image size and creation date

## Creating a Docker Hub Repository Description

Copy and paste the following to your Docker Hub repository's "Overview" section:

```markdown
# 🚀 Lighthouse Docker - Web Performance Auditing Service

A lightweight, containerized Google Lighthouse audit service with a user-friendly web interface and REST API. Built on Alpine Linux with the latest Node.js, Chromium, and Lighthouse.

## Quick Start

```bash
docker run -d -p 3000:3000 --cap-add=SYS_ADMIN saeedp/lighthouse-docker:latest
```

Then open http://localhost:3000 in your browser.

### Docker Compose

```yaml
services:
  lighthouse:
    image: saeedp/lighthouse-docker:latest
    container_name: lighthouse_docker
    ports:
      - "3000:3000"
    cap_add:
      - SYS_ADMIN
```

## ✨ Features

- ⚡ **Web Interface** - User-friendly form for running audits
- 🔌 **REST API** - Programmatic access with JSON responses
- 📊 **Multiple Formats** - HTML reports, full JSON, or filtered metrics
- 🎯 **Selective Metrics** - Query specific performance metrics (Speed Index, FCP, LCP, TBT, CLS, etc.)
- 🐳 **Alpine-based** - Minimal image size (~500MB)
- 🔄 **Latest Versions** - Always uses latest Lighthouse, Node.js, and Chromium
- 🚀 **Fast** - Quick startup and audit execution

## 📖 API Usage

### Get Full JSON Report

```bash
curl "http://localhost:3000/api/analyze?url=https://example.com"
```

Returns complete Lighthouse report with all metrics and scores.

### Get Specific Metrics

```bash
curl "http://localhost:3000/api/analyze?url=https://example.com&metrics=speed-index,fcp,lcp,performance"
```

Returns only the requested metrics in a compact JSON format.

### Get HTML Report

```bash
curl "http://localhost:3000/analyze?url=https://example.com" > report.html
```

## 📊 Available Metrics

**Category Scores (0-100):**
- `performance` - Performance score
- `accessibility` - Accessibility score
- `best-practices` - Best practices score
- `seo` - SEO score

**Performance Metrics (milliseconds):**
- `speed-index` - Speed Index
- `fcp` - First Contentful Paint
- `lcp` - Largest Contentful Paint
- `tti` - Time to Interactive
- `tbt` - Total Blocking Time
- `cls` - Cumulative Layout Shift

## 🏷️ Tags

- `latest` - Latest stable release (recommended)
- `1.0.0` - Specific version for production stability

## ⚙️ Requirements

- Docker or Docker Compose
- `SYS_ADMIN` capability (required for Chrome to run in Docker)
- Port 3000 available (or remap to another port)

## 🔗 Links

- **GitHub Repository**: https://github.com/saeedp/lighthouse-docker
- **Full Documentation**: Complete guide in repository README.md
- **Issues & Support**: https://github.com/saeedp/lighthouse-docker/issues

## 💡 Use Cases

- CI/CD pipeline integration for performance testing
- Automated web performance monitoring
- Internal developer tools for site audits
- Performance testing in containerized environments
- Self-hosted Lighthouse service without Google Cloud dependencies

## 📝 Example Integration

**GitHub Actions:**
```yaml
- name: Run Lighthouse Audit
  run: |
    docker run -d -p 3000:3000 --cap-add=SYS_ADMIN saeedp/lighthouse-docker:latest
    sleep 5
    curl "http://localhost:3000/api/analyze?url=https://mysite.com&metrics=performance,speed-index" > metrics.json
```

**Node.js:**
```javascript
const response = await fetch('http://localhost:3000/api/analyze?url=https://example.com&metrics=performance,fcp,lcp');
const metrics = await response.json();
console.log(`Performance Score: ${metrics.metrics.performance}`);
```

**Python:**
```python
import requests
response = requests.get('http://localhost:3000/api/analyze', params={
    'url': 'https://example.com',
    'metrics': 'performance,speed-index,fcp'
})
metrics = response.json()
print(f"Performance: {metrics['metrics']['performance']}")
```

## 🛠️ Technology Stack

- **Base**: Alpine Linux (minimal footprint)
- **Runtime**: Node.js (latest)
- **Browser**: Chromium (latest)
- **Lighthouse**: Latest version
- **Framework**: Express.js

## 📄 License

MIT License - Free for personal and commercial use

---

⭐ If you find this useful, please star the repository!  
🐛 Found a bug? Open an issue on GitHub.  
💬 Questions? Check the documentation or open a discussion.
```

**Note**: Remember to replace GitHub URLs with your actual repository URLs.

## Deploying to Coolify

To deploy this image on Coolify:

### 1. Create New Resource

1. Go to your Coolify dashboard
2. Click "New Resource" → "Docker Image"
3. Select your server and project

### 2. Configure the Deployment

**Image Name:**
```
saeedp/lighthouse-docker:latest
```

**Important**: Enter ONLY the image name, NOT `docker pull saeedp/lighthouse-docker:latest`

### 3. Set Required Configuration

**Port Mappings:**
- Container Port: `3000`
- Public Port: `3000` (or your preferred port)

**Capabilities:**
- Under "Advanced" settings, add capability: `SYS_ADMIN`

**Environment Variables (Optional):**
- `CHROME_PATH=/usr/bin/chromium-browser` (already set by default)

### 4. Deploy

Click "Deploy" and wait for the container to start. Access your service at:
```
https://your-coolify-domain.com
```

### Example Coolify docker-compose.yml

If deploying via docker-compose in Coolify, use:

```yaml
services:
  lighthouse:
    image: saeedp/lighthouse-docker:latest
    container_name: lighthouse_docker
    ports:
      - "3000:3000"
    cap_add:
      - SYS_ADMIN
    restart: unless-stopped
```

### Troubleshooting Coolify Deployment

**Error: "invalid reference format"**
- Make sure you entered ONLY the image name: `saeedp/lighthouse-docker:latest`
- Do NOT include `docker pull` in the image field

**Error: "Browser tab has unexpectedly crashed"**
- Ensure `SYS_ADMIN` capability is added in Coolify settings
- Check that your server has sufficient memory (minimum 2GB recommended)

**Container keeps restarting**
- Check logs in Coolify dashboard
- Verify port 3000 is not already in use
- Ensure proper network configuration

## Multi-Platform Support (Optional)

To support both AMD64 and ARM64 architectures:

### 1. Create a Builder

```bash
docker buildx create --name multiplatform --use
docker buildx inspect --bootstrap
```

### 2. Build and Push for Multiple Platforms

```bash
docker buildx build --platform linux/amd64,linux/arm64 \
  -t yourusername/lighthouse-docker:latest \
  -t yourusername/lighthouse-docker:1.0.0 \
  --push .
```

This creates images for:
- `linux/amd64` - Intel/AMD processors (most servers, Windows, Mac Intel)
- `linux/arm64` - ARM processors (Mac M1/M2, Raspberry Pi, ARM servers)

## Automated Publishing with GitHub Actions

Create `.github/workflows/docker-publish.yml`:

```yaml
name: Publish Docker Image

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2
      
      - name: Login to Docker Hub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
      
      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v4
        with:
          images: yourusername/lighthouse-docker
          tags: |
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=raw,value=latest
      
      - name: Build and push
        uses: docker/build-push-action@v4
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
```

Then create a tag to trigger:

```bash
git tag v1.0.0
git push origin v1.0.0
```

## Version Management

### Semantic Versioning

Follow semantic versioning: `MAJOR.MINOR.PATCH`

- **MAJOR**: Breaking changes
- **MINOR**: New features, backwards compatible
- **PATCH**: Bug fixes

### Version Tags Strategy

Always push:
1. **Specific version**: `1.0.0`, `1.0.1`, `1.1.0`
2. **Minor version**: `1.0`, `1.1`
3. **Latest**: `latest`

Example:
```bash
docker tag yourusername/lighthouse-docker:1.0.1 yourusername/lighthouse-docker:1.0
docker tag yourusername/lighthouse-docker:1.0.1 yourusername/lighthouse-docker:latest

docker push yourusername/lighthouse-docker:1.0.1
docker push yourusername/lighthouse-docker:1.0
docker push yourusername/lighthouse-docker:latest
```

## Security Best Practices

1. **Never commit credentials**: Use environment variables or Docker secrets
2. **Use access tokens**: Create a Docker Hub access token instead of using password
3. **Scan images**: Run security scans before publishing:
   ```bash
   docker scout cves yourusername/lighthouse-docker:latest
   ```
4. **Keep dependencies updated**: Regularly rebuild with latest base images

## Updating Published Images

When you make changes:

1. Increment version in package.json
2. Update CHANGELOG in README.md
3. Build with new version tag
4. Push both new version and latest
5. Update Docker Hub description if needed

```bash
# Build new version
docker build -t yourusername/lighthouse-docker:1.0.1 -t yourusername/lighthouse-docker:latest .

# Push
docker push yourusername/lighthouse-docker:1.0.1
docker push yourusername/lighthouse-docker:latest
```

## Monitoring Usage

Check your image stats on Docker Hub:
- Pull count
- Star count
- Size metrics
- Build history

Enable automated builds to rebuild on base image updates.

## Support and Community

- **GitHub Issues**: For bug reports and feature requests
- **Docker Hub**: For image-specific issues
- **Documentation**: Keep README updated with latest changes
