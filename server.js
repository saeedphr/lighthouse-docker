// Disable SSL certificate verification for broken SSL sites
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const express = require('express');
const lighthouse = require('lighthouse').default;
const chromeLauncher = require('chrome-launcher');
const packageJson = require('./package.json');
const https = require('https');
const http = require('http');

const app = express();

// Configuration via environment variables
const PORT = parseInt(process.env.PORT) || 3000;
const VERSION = packageJson.version || '1.0.0';
const MAX_REDIRECTS = parseInt(process.env.MAX_REDIRECTS) || 10;
const LIGHTHOUSE_TIMEOUT = parseInt(process.env.LIGHTHOUSE_TIMEOUT) || 180000; // 180 seconds
const DEFAULT_DEVICE = process.env.DEFAULT_DEVICE || 'mobile';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const PAGE_TITLE = process.env.PAGE_TITLE || 'Lighthouse Audit Tool';
const ENABLE_HTTP_FALLBACK = process.env.ENABLE_HTTP_FALLBACK === 'true';
const EXTRA_CHROME_FLAGS = process.env.EXTRA_CHROME_FLAGS || '';

// Default Chrome flags (always used)
const DEFAULT_CHROME_FLAGS = [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--ignore-certificate-errors',
  '--ignore-certificate-errors-spki-list',
  '--allow-running-insecure-content',
  '--disable-features=TranslateUI,IsolateOrigins,site-per-process',
  '--disable-site-isolation-trials',
  '--disable-background-networking',
  '--disable-default-apps',
  '--disable-extensions',
  '--disable-sync',
  '--disable-translate',
  '--metrics-recording-only',
  '--mute-audio',
  '--no-first-run',
  '--safebrowsing-disable-auto-update'
];

// Function to get Chrome flags with optional extras
function getChromeFlags(urlOrigin) {
  const flags = [
    ...DEFAULT_CHROME_FLAGS,
    `--unsafely-treat-insecure-origin-as-secure=${urlOrigin}`
  ];
  
  // Add extra flags from environment variable (comma-separated)
  if (EXTRA_CHROME_FLAGS) {
    const extraFlags = EXTRA_CHROME_FLAGS.split(',').map(f => f.trim()).filter(f => f);
    flags.push(...extraFlags);
  }
  
  return flags;
}

console.log(`Configuration: PORT=${PORT}, MAX_REDIRECTS=${MAX_REDIRECTS}, LIGHTHOUSE_TIMEOUT=${LIGHTHOUSE_TIMEOUT}ms, DEFAULT_DEVICE=${DEFAULT_DEVICE}, LOG_LEVEL=${LOG_LEVEL}`);
console.log(`UI Settings: PAGE_TITLE="${PAGE_TITLE}", ENABLE_HTTP_FALLBACK=${ENABLE_HTTP_FALLBACK}`);
if (EXTRA_CHROME_FLAGS) console.log(`Extra Chrome Flags: ${EXTRA_CHROME_FLAGS}`);

// Helper function to follow redirects and get final URL
async function getFinalUrl(url, maxRedirects = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const options = {
      method: 'HEAD',
      timeout: 10000,
      rejectUnauthorized: false
    };
    
    const makeRequest = (currentUrl, redirectCount) => {
      if (redirectCount > maxRedirects) {
        return resolve(currentUrl); // Return last URL if too many redirects
      }
      
      const reqProtocol = currentUrl.startsWith('https') ? https : http;
      const req = reqProtocol.request(currentUrl, options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let redirectUrl = res.headers.location;
          // Handle relative redirects
          if (redirectUrl.startsWith('/')) {
            const urlObj = new URL(currentUrl);
            redirectUrl = `${urlObj.protocol}//${urlObj.host}${redirectUrl}`;
          }
          console.log(`Redirect ${redirectCount + 1}: ${currentUrl} -> ${redirectUrl}`);
          makeRequest(redirectUrl, redirectCount + 1);
        } else {
          resolve(currentUrl);
        }
      });
      
      req.on('error', (err) => {
        console.log(`Error following redirect: ${err.message}, using original URL`);
        resolve(currentUrl);
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve(currentUrl);
      });
      
      req.end();
    };
    
    makeRequest(url, 0);
  });
}

// 1. Route to serve the input form
app.get('/', (req, res) => {
    const httpFallbackChecked = ENABLE_HTTP_FALLBACK ? 'checked' : '';
    const httpFallbackDisplay = ENABLE_HTTP_FALLBACK ? 'block' : 'none';
    const defaultMobile = DEFAULT_DEVICE === 'mobile' ? 'selected' : '';
    const defaultDesktop = DEFAULT_DEVICE === 'desktop' ? 'selected' : '';
    
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${PAGE_TITLE}</title>
        <style>
            body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f0f0f0; margin: 0; padding: 20px; }
            .container { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 600px; width: 100%; }
            h1 { text-align: center; margin-top: 0; }
            input[type="url"] { padding: 10px; width: 100%; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; margin-bottom: 15px; }
            .form-group { margin-bottom: 15px; text-align: left; }
            .form-group label { display: block; margin-bottom: 5px; font-weight: bold; }
            select { padding: 10px; width: 100%; border: 1px solid #ccc; border-radius: 4px; }
            .checkbox-group { display: flex; flex-wrap: wrap; gap: 10px; }
            .checkbox-group label { font-weight: normal; display: flex; align-items: center; }
            .checkbox-group input { margin-right: 5px; }
            button { padding: 10px 20px; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; width: 100%; }
            button:hover { background-color: #0056b3; }
            .loader { margin-top: 15px; color: #666; display: none; text-align: center; }
            .api-info { margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 4px; font-size: 0.9em; }
            .api-info code { background: #e9ecef; padding: 2px 6px; border-radius: 3px; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; text-align: center; font-size: 0.85em; color: #666; }
            .footer a { color: #007bff; text-decoration: none; }
            .footer a:hover { text-decoration: underline; }
            .footer .docker-icon { display: inline-block; margin-right: 5px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>⚡ Lighthouse Website Checker</h1>
            <p style="text-align: center;">Enter a URL to generate a Google Lighthouse report.</p>
            
            <form onsubmit="startAudit(event)">
                <div class="form-group">
                    <label>URL to Audit:</label>
                    <input type="url" id="urlInput" placeholder="https://example.com" required>
                </div>

                <div class="form-group">
                    <label>Device:</label>
                    <select id="deviceSelect">
                        <option value="mobile" ${defaultMobile}>📱 Mobile</option>
                        <option value="desktop" ${defaultDesktop}>🖥️ Desktop</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>
                        <input type="checkbox" id="httpFallback" ${httpFallbackChecked}> 
                        Use HTTP (for sites with broken SSL certificates)
                    </label>
                </div>

                <div class="form-group">
                    <label>Output Format:</label>
                    <select id="formatSelect" onchange="toggleMetricsGroup()">
                        <option value="html">HTML Report (Full)</option>
                        <option value="json">JSON (All Data)</option>
                        <option value="metrics">JSON (Key Metrics Only)</option>
                    </select>
                </div>

                <div class="form-group" id="metricsGroup">
                    <label>Specific Metrics (for JSON Metrics mode):</label>
                    <div class="checkbox-group">
                        <label><input type="checkbox" name="metric" value="performance" checked> Performance Score</label>
                        <label><input type="checkbox" name="metric" value="speed-index"> Speed Index</label>
                        <label><input type="checkbox" name="metric" value="fcp"> First Contentful Paint</label>
                        <label><input type="checkbox" name="metric" value="lcp"> Largest Contentful Paint</label>
                        <label><input type="checkbox" name="metric" value="tti"> Time to Interactive</label>
                        <label><input type="checkbox" name="metric" value="tbt"> Total Blocking Time</label>
                        <label><input type="checkbox" name="metric" value="cls"> Cumulative Layout Shift</label>
                    </div>
                </div>

                <button type="submit">Run Audit</button>
                <div id="loader" class="loader">Running audit (approx 30s)...</div>
            </form>

            <div class="api-info">
                <strong>📡 API Usage:</strong><br>
                HTML: <code>/analyze?url=https://example.com&device=mobile</code><br>
                JSON: <code>/api/analyze?url=https://example.com&device=desktop</code><br>
                Metrics: <code>/api/analyze?url=https://example.com&device=mobile&metrics=speed-index,fcp,lcp</code>
            </div>

            <div class="footer">
                <div>🐳 <a href="https://hub.docker.com/r/saeedp/lighthouse-docker" target="_blank" rel="noopener">Docker Hub</a> | <a href="https://github.com/saeedphr/lighthouse-docker" target="_blank" rel="noopener">GitHub</a> <span style="color: #999;">v${VERSION}</span></div>
                <div style="margin-top: 8px;">Built with Alpine Linux, Node.js & Lighthouse</div>
            </div>
        </div>

        <script>
            // Toggle metrics group visibility based on format selection
            function toggleMetricsGroup() {
                const format = document.getElementById('formatSelect').value;
                const metricsGroup = document.getElementById('metricsGroup');
                metricsGroup.style.display = format === 'metrics' ? 'block' : 'none';
            }
            
            // Initialize on page load
            document.addEventListener('DOMContentLoaded', toggleMetricsGroup);
            document.getElementById('formatSelect').addEventListener('change', toggleMetricsGroup);
            
            function startAudit(event) {
                event.preventDefault();
                let url = document.getElementById('urlInput').value;
                const format = document.getElementById('formatSelect').value;
                const device = document.getElementById('deviceSelect').value;
                const useHttp = document.getElementById('httpFallback').checked;
                
                // Convert to HTTP if checkbox is checked
                if (useHttp) {
                    url = url.replace('https://', 'http://');
                }
                
                document.getElementById('loader').style.display = 'block';
                
                let endpoint = '/analyze';
                let params = '?url=' + encodeURIComponent(url) + '&device=' + device;
                
                if (format === 'json') {
                    endpoint = '/api/analyze';
                } else if (format === 'metrics') {
                    endpoint = '/api/analyze';
                    const selectedMetrics = Array.from(document.querySelectorAll('input[name="metric"]:checked'))
                        .map(cb => cb.value)
                        .join(',');
                    if (selectedMetrics) {
                        params += '&metrics=' + selectedMetrics;
                    }
                }
                
                window.location.href = endpoint + params;
            }
        </script>
    </body>
    </html>
    `);
});

// 2. Route to perform the audit
app.get('/analyze', async (req, res) => {
  let url = req.query.url;
  const device = req.query.device || DEFAULT_DEVICE;

  if (!url) {
    return res.status(400).send('Please provide a URL via the ?url= parameter');
  }

  console.log(`Starting audit for: ${url} (device: ${device})`);

  // Follow redirects to get final URL
  try {
    const finalUrl = await getFinalUrl(url);
    if (finalUrl !== url) {
      console.log(`Following redirect: ${url} -> ${finalUrl}`);
      url = finalUrl;
    }
  } catch (e) {
    console.log(`Could not follow redirects: ${e.message}, using original URL`);
  }

  // Extract origin for security bypass
  const urlOrigin = new URL(url).origin;
  
  // Device-specific settings
  const isMobile = device === 'mobile';
  const deviceSettings = isMobile ? {
    formFactor: 'mobile',
    screenEmulation: {
      mobile: true,
      width: 412,
      height: 823,
      deviceScaleFactor: 1.75,
      disabled: false,
    },
    throttling: {
      rttMs: 150,
      throughputKbps: 1638.4,
      cpuSlowdownMultiplier: 4,
    },
  } : {
    formFactor: 'desktop',
    screenEmulation: {
      mobile: false,
      width: 1350,
      height: 940,
      deviceScaleFactor: 1,
      disabled: false,
    },
    throttling: {
      rttMs: 40,
      throughputKbps: 10240,
      cpuSlowdownMultiplier: 1,
    },
  };
  
  let chrome;
  try {
    // Launch headless Chrome
    chrome = await chromeLauncher.launch({
      chromeFlags: getChromeFlags(urlOrigin)
    });

    console.log(`Chrome launched on port: ${chrome.port}`);

    const options = {
      logLevel: LOG_LEVEL,
      output: 'html',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      port: chrome.port,
      formFactor: deviceSettings.formFactor,
      screenEmulation: deviceSettings.screenEmulation,
      throttling: deviceSettings.throttling
    };

    // Run Lighthouse
    const runnerResult = await lighthouse(url, options);
    
    if (!runnerResult || !runnerResult.lhr) {
      console.error('Lighthouse failed to generate report - no result returned');
      throw new Error('Lighthouse failed to generate report');
    }
    
    console.log('Lighthouse completed successfully');
    console.log('Final URL:', runnerResult.lhr.finalUrl);
    console.log('Runtime errors:', runnerResult.lhr.runtimeError);
    
    const reportHtml = runnerResult.report;

    console.log('Report is done for', runnerResult.lhr.finalUrl);
    
    await chrome.kill();

    // Send the HTML report directly
    res.setHeader('Content-Type', 'text/html');
    res.send(reportHtml);

  } catch (error) {
    console.error('Error running lighthouse:', error);
    console.error('Error stack:', error.stack);
    if (chrome) await chrome.kill();
    res.status(500).send(`Error generating report: ${error.message}<br><br>Check container logs for details: <code>docker logs lighthouse_docker</code>`);
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    version: VERSION,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Lighthouse service listening on port ${PORT}`);
});

// Debug endpoint to test site connectivity
app.get('/debug/check', async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).json({ error: 'Provide url parameter' });
  }

  const results = {
    url: url,
    timestamp: new Date().toISOString(),
    tests: {}
  };

  // Test DNS resolution
  try {
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);
    
    const hostname = new URL(url).hostname;
    
    // DNS lookup
    try {
      const { stdout: dnsOut } = await execPromise(`nslookup ${hostname}`);
      results.tests.dns = { status: 'success', output: dnsOut };
    } catch (e) {
      results.tests.dns = { status: 'failed', error: e.message };
    }

    // Ping test
    try {
      const { stdout: pingOut } = await execPromise(`ping -c 2 ${hostname}`);
      results.tests.ping = { status: 'success', output: pingOut };
    } catch (e) {
      results.tests.ping = { status: 'failed', error: e.message };
    }

    // Curl test
    try {
      const { stdout: curlOut } = await execPromise(`curl -I -k --connect-timeout 10 "${url}" 2>&1`);
      results.tests.curl = { status: 'success', output: curlOut };
    } catch (e) {
      results.tests.curl = { status: 'failed', error: e.message, stderr: e.stderr };
    }

    // Detailed curl test with verbose
    try {
      const { stdout: curlVerbose } = await execPromise(`curl -I -k -v --connect-timeout 10 "${url}" 2>&1`);
      results.tests.curlVerbose = { status: 'success', output: curlVerbose };
    } catch (e) {
      results.tests.curlVerbose = { status: 'failed', error: e.message, output: e.stdout || '' };
    }

    // Test if HTTP works instead
    const httpUrl = url.replace('https://', 'http://');
    try {
      const { stdout: httpOut } = await execPromise(`curl -I --connect-timeout 10 "${httpUrl}" 2>&1`);
      results.tests.http = { status: 'success', output: httpOut };
    } catch (e) {
      results.tests.http = { status: 'failed', error: e.message };
    }

    // Port check
    try {
      const hostname = new URL(url).hostname;
      const port = new URL(url).port || (url.startsWith('https:') ? '443' : '80');
      const { stdout: ncOut } = await execPromise(`timeout 5 nc -zv ${hostname} ${port} 2>&1`);
      results.tests.portCheck = { status: 'success', output: ncOut };
    } catch (e) {
      results.tests.portCheck = { status: 'failed', error: e.message, output: e.stdout || '' };
    }

  } catch (error) {
    results.error = error.message;
  }

  res.json(results);
});

// 3. API Route to get JSON results
app.get('/api/analyze', async (req, res) => {
  let url = req.query.url;
  const metricsParam = req.query.metrics;
  const device = req.query.device || DEFAULT_DEVICE;

  if (!url) {
    return res.status(400).json({ error: 'Please provide a URL via the ?url= parameter' });
  }

  console.log(`Starting API audit for: ${url} (device: ${device})`);

  // Follow redirects to get final URL
  try {
    const finalUrl = await getFinalUrl(url);
    if (finalUrl !== url) {
      console.log(`Following redirect: ${url} -> ${finalUrl}`);
      url = finalUrl;
    }
  } catch (e) {
    console.log(`Could not follow redirects: ${e.message}, using original URL`);
  }

  // Extract origin for security bypass
  const urlOrigin = new URL(url).origin;
  
  // Device-specific settings
  const isMobile = device === 'mobile';
  const deviceSettings = isMobile ? {
    formFactor: 'mobile',
    screenEmulation: {
      mobile: true,
      width: 412,
      height: 823,
      deviceScaleFactor: 1.75,
      disabled: false,
    },
    throttling: {
      rttMs: 150,
      throughputKbps: 1638.4,
      cpuSlowdownMultiplier: 4,
    },
  } : {
    formFactor: 'desktop',
    screenEmulation: {
      mobile: false,
      width: 1350,
      height: 940,
      deviceScaleFactor: 1,
      disabled: false,
    },
    throttling: {
      rttMs: 40,
      throughputKbps: 10240,
      cpuSlowdownMultiplier: 1,
    },
  };

  let chrome;
  try {
    // Launch headless Chrome
    chrome = await chromeLauncher.launch({
      chromeFlags: getChromeFlags(urlOrigin)
    });

    const options = {
      logLevel: LOG_LEVEL,
      output: 'json',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      port: chrome.port,
      formFactor: deviceSettings.formFactor,
      screenEmulation: deviceSettings.screenEmulation,
      throttling: deviceSettings.throttling
    };

    // Run Lighthouse with timeout
    const runnerResult = await Promise.race([
      lighthouse(url, options),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Lighthouse audit timed out after ${LIGHTHOUSE_TIMEOUT / 1000} seconds`)), LIGHTHOUSE_TIMEOUT)
      )
    ]);
    
    if (!runnerResult || !runnerResult.lhr) {
      throw new Error('Lighthouse failed to generate report');
    }
    
    const lhr = runnerResult.lhr;

    console.log('API Report is done for', lhr.finalUrl);
    
    await chrome.kill();

    // If specific metrics requested, filter the response
    if (metricsParam) {
      const requestedMetrics = metricsParam.split(',').map(m => m.trim());
      const filteredData = {
        url: lhr.finalUrl,
        fetchTime: lhr.fetchTime,
        metrics: {}
      };

      // Map of metric names to their locations in the LHR
      const metricMap = {
        'performance': () => lhr.categories?.performance?.score ? lhr.categories.performance.score * 100 : null,
        'accessibility': () => lhr.categories?.accessibility?.score ? lhr.categories.accessibility.score * 100 : null,
        'best-practices': () => lhr.categories?.['best-practices']?.score ? lhr.categories['best-practices'].score * 100 : null,
        'seo': () => lhr.categories?.seo?.score ? lhr.categories.seo.score * 100 : null,
        'speed-index': () => lhr.audits?.['speed-index']?.numericValue ?? null,
        'fcp': () => lhr.audits?.['first-contentful-paint']?.numericValue ?? null,
        'lcp': () => lhr.audits?.['largest-contentful-paint']?.numericValue ?? null,
        'tti': () => lhr.audits?.['interactive']?.numericValue ?? null,
        'tbt': () => lhr.audits?.['total-blocking-time']?.numericValue ?? null,
        'cls': () => lhr.audits?.['cumulative-layout-shift']?.numericValue ?? null
      };

      requestedMetrics.forEach(metric => {
        if (metricMap[metric]) {
          const value = metricMap[metric]();
          if (value !== null && value !== undefined) {
            filteredData.metrics[metric] = value;
          }
        }
      });

      return res.json(filteredData);
    }

    // Return full JSON report
    res.json({
      url: lhr.finalUrl,
      fetchTime: lhr.fetchTime,
      categories: {
        performance: lhr.categories?.performance?.score ? lhr.categories.performance.score * 100 : null,
        accessibility: lhr.categories?.accessibility?.score ? lhr.categories.accessibility.score * 100 : null,
        bestPractices: lhr.categories?.['best-practices']?.score ? lhr.categories['best-practices'].score * 100 : null,
        seo: lhr.categories?.seo?.score ? lhr.categories.seo.score * 100 : null
      },
      audits: {
        speedIndex: lhr.audits?.['speed-index']?.numericValue ?? null,
        firstContentfulPaint: lhr.audits?.['first-contentful-paint']?.numericValue ?? null,
        largestContentfulPaint: lhr.audits?.['largest-contentful-paint']?.numericValue ?? null,
        timeToInteractive: lhr.audits?.['interactive']?.numericValue ?? null,
        totalBlockingTime: lhr.audits?.['total-blocking-time']?.numericValue ?? null,
        cumulativeLayoutShift: lhr.audits?.['cumulative-layout-shift']?.numericValue ?? null
      },
      fullReport: lhr
    });

  } catch (error) {
    console.error('Error running lighthouse API:', error);
    if (chrome) await chrome.kill();
    res.status(500).json({ error: 'Error generating report', message: error.message });
  }
});