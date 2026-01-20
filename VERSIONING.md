# Versioning Strategy

## Version Display

The footer on the web interface displays the version from `package.json`:

- **Format:** `v1.1.0` (example)
- **Source:** Reads from `package.json` version field
- **Location:** Bottom of homepage, next to Docker Hub link

## Docker Hub Tags

When publishing to Docker Hub, use both numbered version and `latest` tag:

### Build with Version Tags

```bash
# Build with specific version and latest
docker build -t saeedp/lighthouse-docker:1.1.0 -t saeedp/lighthouse-docker:latest .

# Push both tags
docker push saeedp/lighthouse-docker:1.1.0
docker push saeedp/lighthouse-docker:latest
```

### Version Numbering

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR.MINOR.PATCH** (e.g., 1.1.0)
  - **MAJOR**: Breaking changes
  - **MINOR**: New features (backwards compatible)
  - **PATCH**: Bug fixes

### Examples

- `1.0.0` - Initial release
- `1.1.0` - Added slow site handling (3-minute timeouts)
- `1.1.1` - Bug fix for syntax error (patch)
- `2.0.0` - Breaking API changes (major)

## Update Process

When releasing a new version:

1. **Update package.json:**
   ```json
   {
     "version": "1.1.0"
   }
   ```

2. **Build with tags:**
   ```bash
   docker build -t saeedp/lighthouse-docker:1.1.0 -t saeedp/lighthouse-docker:latest .
   ```

3. **Push to Docker Hub:**
   ```bash
   docker push saeedp/lighthouse-docker:1.1.0
   docker push saeedp/lighthouse-docker:latest
   ```

4. **Update CHANGES.md** with release notes

## Current Version

**v1.1.0** - Added 3-minute timeout support for slow-loading sites

### Changelog

- **v1.1.0** (2026-01-19)
  - Increased timeouts to 180 seconds (3 minutes)
  - Added version display in footer
  - Enhanced slow site handling
  - Improved troubleshooting documentation

- **v1.0.0** (Initial Release)
  - Web interface with HTML/JSON/Metrics output
  - REST API with selective metrics
  - SSL certificate bypass
  - Alpine Linux base with latest Node.js & Lighthouse
  - Debug connectivity endpoint
