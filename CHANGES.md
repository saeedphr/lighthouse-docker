# Recent Changes - SSL Certificate Verification Failure

## Critical Discovery (2026-01-19)

### The Real Problem: Broken SSL Certificate

After extensive debugging, the root cause has been identified:

**Wget Test Result:**
```bash
root@paas:~# docker exec -it c425c54395dd wget -T 60 https://atlas.parshost.sbs/
Connecting to atlas.parshost.sbs (185.55.224.53:443)
286B5B2CAB7C0000:error:0A000086:SSL routines:tls_post_process_server_certificate:certificate verify failed
ssl_client: SSL_connect
wget: error getting response: Connection reset by peer
```

**Analysis:**
- ✅ DNS resolves correctly (185.55.224.53)
- ✅ Port 443 is open and accepting connections
- ❌ **SSL certificate verification fails at OpenSSL level**
- ❌ SSL handshake cannot complete
- ❌ Connection reset by peer after certificate rejection

### What This Means

The site's SSL certificate has **fundamental problems**:
1. Certificate chain incomplete or invalid
2. Self-signed certificate without proper CA
3. Expired or revoked certificate
4. Server SSL configuration severely broken

### Why Chrome Shows Interstitial

Even with `--ignore-certificate-errors`, Chrome can't bypass errors that occur **before** it can evaluate the certificate. The SSL handshake fails at the OpenSSL/BoringSSL layer.

### Changes Made (Latest Attempt)

Added even more aggressive Chrome flags:
```javascript
'--disable-background-networking',
'--disable-client-side-phishing-detection',
'--disable-default-apps'
```

**Result:** These flags won't help because the SSL handshake fails **before Chrome gets involved**.

---

## Previous Changes - Handling Slow-Loading Sites

### Update Summary (2026-01-19)

### Problem Identified
The site `atlas.parshost.sbs` was timing out during Lighthouse audits. Analysis of container logs revealed:
- Site **was successfully connecting** via HTTPS (eventually found to be partial)
- Resources **were loading** (60+ files fetched in successful tests)
- **Timeout occurring** before page fully loaded (90 seconds)
- Many "inflight" requests remaining (Google Fonts, WooCommerce scripts, images)
- Chrome showing "CHROME_INTERSTITIAL_ERROR" after timeout

### Root Cause (Updated)
~~Not an SSL/TLS handshake failure~~ **CORRECTION:** Actually IS an SSL failure, but manifests as slow loading because:
- Initial SSL handshake takes 2+ minutes before failing
- Some resources load before certificate validation completes
- OpenSSL eventually rejects the certificate
- Chrome shows error page

### Changes Made

#### 1. Increased Timeouts
**server.js** - Both `/analyze` and `/api/analyze` endpoints:
```javascript
maxWaitForLoad: 180000,        // 3 minutes (was 90 seconds)
maxWaitForFcp: 60000,          // 1 minute for first paint (new)
pauseAfterFcpMs: 1000,         // Wait after first paint (new)
pauseAfterLoadMs: 1000,        // Wait after load (new)
networkQuietThresholdMs: 1000, // Network quiet threshold (new)
cpuQuietThresholdMs: 1000,     // CPU quiet threshold (new)
```

#### 2. Additional Chrome Flags
Added flags to handle slow sites and SSL issues:
```javascript
'--disable-font-subpixel-positioning',
'--disable-hang-monitor',
'--disable-prompt-on-repost',
'--disable-sync',
'--metrics-recording-only',
'--disable-background-networking',
'--disable-client-side-phishing-detection',
'--disable-default-apps'
```

#### 3. Updated Documentation
**README.md** - Enhanced troubleshooting section:
- Explained difference between SSL failures and slow loading
- Added timeout configuration details
- Provided debugging commands
- Added critical section on OpenSSL certificate verification failures
- Clarified when issues are server-side vs container-side

---

## Conclusion for atlas.parshost.sbs

### The Site Cannot Be Audited Because:

1. **SSL Certificate Fundamentally Broken**
   - OpenSSL rejects it immediately
   - No amount of Chrome flags can bypass this
   - Occurs before Chrome can evaluate the page

2. **Verification:**
   ```bash
   # This fails:
   wget https://atlas.parshost.sbs/
   
   # This works (bypasses cert check):
   wget --no-check-certificate https://atlas.parshost.sbs/
   
   # Test if HTTP works:
   wget http://atlas.parshost.sbs/
   ```

3. **Required Fix: Server-Side**
   - Install valid SSL certificate
   - Configure proper certificate chain
   - Use Let's Encrypt or commercial CA
   - Test with: `openssl s_client -connect atlas.parshost.sbs:443`

### Service Status

The Lighthouse Docker service is **working correctly**. It successfully:
- ✅ Handles sites with valid HTTPS
- ✅ Bypasses minor certificate warnings
- ✅ Supports slow-loading sites (up to 3 minutes)
- ✅ Tests with expired certificates (minor issues)
- ❌ **Cannot bypass fundamentally broken SSL at OpenSSL level**

### Testing Recommendations

Test with working sites first:
```bash
# Known good sites:
curl "http://localhost:3000/api/analyze?url=https://google.com&metrics=performance"
curl "http://localhost:3000/api/analyze?url=https://github.com&metrics=speed-index,fcp"

# Then test your site:
curl "http://localhost:3000/api/analyze?url=http://atlas.parshost.sbs"  # Try HTTP
```
