// Disable SSL certificate verification for broken SSL sites
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const express = require('express');
const { fork } = require('child_process');
const path = require('path');
const packageJson = require('./package.json');
const https = require('https');
const http = require('http');

const app = express();

// Worker Pool for concurrent Lighthouse execution
// Each worker runs in a separate process with isolated global state
class LighthouseWorkerPool {
  constructor(maxWorkers = 5) {
    this.maxWorkers = maxWorkers;
    this.activeWorkers = new Map(); // taskId -> worker
    this.queue = [];
    this.totalProcessed = 0;
    this.totalFailed = 0;
  }

  async execute(taskId, url, device, outputFormat, options) {
    // If we have capacity, start immediately
    if (this.activeWorkers.size < this.maxWorkers) {
      return this.spawnWorker(taskId, url, device, outputFormat, options);
    }

    // Otherwise, queue the task
    console.log(`[WorkerPool] Task ${taskId} queued. Active: ${this.activeWorkers.size}/${this.maxWorkers}, Queue: ${this.queue.length}`);
    
    return new Promise((resolve, reject) => {
      this.queue.push({ taskId, url, device, outputFormat, options, resolve, reject });
    });
  }

  spawnWorker(taskId, url, device, outputFormat, options) {
    return new Promise((resolve, reject) => {
      console.log(`[WorkerPool] Spawning worker for task ${taskId}. Active: ${this.activeWorkers.size + 1}/${this.maxWorkers}`);

      const worker = fork(path.join(__dirname, 'lighthouse-worker.js'));
      this.activeWorkers.set(taskId, worker);

      // Set timeout for the entire task
      const timeout = setTimeout(() => {
        console.error(`[WorkerPool] Task ${taskId} timed out`);
        worker.kill();
        this.activeWorkers.delete(taskId);
        this.totalFailed++;
        reject(new Error('Lighthouse audit timed out'));
        this.processQueue();
      }, options.timeout || 180000);

      // Listen for results
      worker.on('message', (message) => {
        console.log(`[WorkerPool] Received message from worker for task ${taskId}:`, message.success ? 'SUCCESS' : 'FAILURE');
        clearTimeout(timeout);
        
        // Only process if task is still active (not already handled)
        if (!this.activeWorkers.has(taskId)) {
          console.warn(`[WorkerPool] Task ${taskId} message received but task no longer active`);
          return;
        }
        
        if (message.success) {
          console.log(`[WorkerPool] Task ${taskId} completed successfully`);
          this.totalProcessed++;
          this.activeWorkers.delete(taskId);
          resolve({
            report: message.report,
            lhr: message.lhr
          });
          this.processQueue();
        } else {
          console.error(`[WorkerPool] Task ${taskId} failed:`, message.error);
          this.totalFailed++;
          this.activeWorkers.delete(taskId);
          reject(new Error(message.error));
          this.processQueue();
        }
      });

      // Handle worker errors
      worker.on('error', (error) => {
        clearTimeout(timeout);
        console.error(`[WorkerPool] Worker error for task ${taskId}:`, error);
        if (this.activeWorkers.has(taskId)) {
          this.activeWorkers.delete(taskId);
          this.totalFailed++;
          reject(error);
          this.processQueue();
        }
      });

      // Handle worker exit
      worker.on('exit', (code, signal) => {
        console.log(`[WorkerPool] Worker exited for task ${taskId}. Code: ${code}, Signal: ${signal}`);
        clearTimeout(timeout);
        
        // Only handle if task is still active (message wasn't received)
        if (this.activeWorkers.has(taskId)) {
          console.error(`[WorkerPool] Task ${taskId} - worker exited unexpectedly before completing`);
          this.activeWorkers.delete(taskId);
          this.totalFailed++;
          reject(new Error(`Worker process exited ${signal ? 'with signal ' + signal : 'with code ' + code} before completing`));
          this.processQueue();
        }
      });

      // Send task to worker
      worker.send({ taskId, url, device, outputFormat, options });
    });
  }

  processQueue() {
    // Process queued tasks if we have capacity
    while (this.queue.length > 0 && this.activeWorkers.size < this.maxWorkers) {
      const { taskId, url, device, outputFormat, options, resolve, reject } = this.queue.shift();
      console.log(`[WorkerPool] Processing queued task ${taskId}. Queue remaining: ${this.queue.length}`);
      
      this.spawnWorker(taskId, url, device, outputFormat, options)
        .then(resolve)
        .catch(reject);
    }
  }

  getStats() {
    return {
      maxWorkers: this.maxWorkers,
      activeWorkers: this.activeWorkers.size,
      queueLength: this.queue.length,
      totalProcessed: this.totalProcessed,
      totalFailed: this.totalFailed,
      activeTasks: Array.from(this.activeWorkers.keys())
    };
  }
}

// Legacy queue class - keeping for backward compatibility but not used
class LighthouseQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.currentTask = null;
    this.totalProcessed = 0;
    this.concurrentAttempts = 0;
  }

  async enqueue(task, taskId) {
    const queuePosition = this.queue.length;
    console.log(`[Queue] Task ${taskId} enqueued. Position: ${queuePosition}, Currently processing: ${this.processing ? 'YES' : 'NO'}`);
    
    // Detect concurrent attempts
    if (this.processing) {
      this.concurrentAttempts++;
      console.warn(`[Queue] CONCURRENT ATTEMPT DETECTED! Task ${taskId} will wait. Total concurrent attempts: ${this.concurrentAttempts}`);
    }
    
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject, taskId, enqueuedAt: Date.now() });
      this.process();
    });
  }

  async process() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    const { task, resolve, reject, taskId, enqueuedAt } = this.queue.shift();
    this.currentTask = taskId;
    
    const waitTime = Date.now() - enqueuedAt;
    console.log(`[Queue] Processing task ${taskId}. Wait time: ${waitTime}ms. Queue remaining: ${this.queue.length}`);

    try {
      const result = await task();
      this.totalProcessed++;
      console.log(`[Queue] Task ${taskId} completed successfully. Total processed: ${this.totalProcessed}`);
      resolve(result);
    } catch (error) {
      console.error(`[Queue] Task ${taskId} failed:`, error.message);
      reject(error);
    } finally {
      this.processing = false;
      this.currentTask = null;
      // Process next item in queue
      setImmediate(() => this.process());
    }
  }

  getQueueLength() {
    return this.queue.length;
  }

  isProcessing() {
    return this.processing;
  }
  
  getStats() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      currentTask: this.currentTask,
      totalProcessed: this.totalProcessed,
      concurrentAttempts: this.concurrentAttempts
    };
  }
}

const lighthouseWorkerPool = new LighthouseWorkerPool(parseInt(process.env.MAX_CONCURRENT_AUDITS) || 5);

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

// Helper function to run Lighthouse audit (extracted for queue usage)
// Helper function to resolve redirects (used before sending to worker)
async function resolveUrl(url) {
  try {
    const finalUrl = await getFinalUrl(url);
    if (finalUrl !== url) {
      console.log(`Following redirect: ${url} -> ${finalUrl}`);
      return finalUrl;
    }
  } catch (e) {
    console.log(`Could not follow redirects: ${e.message}, using original URL`);
  }
  return url;
}

// 2. Route to perform the audit
app.get('/analyze', async (req, res) => {
  let url = req.query.url;
  const device = req.query.device || DEFAULT_DEVICE;

  if (!url) {
    return res.status(400).send('Please provide a URL via the ?url= parameter');
  }

  const taskId = `HTML-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log(`[${taskId}] Request received for: ${url} (device: ${device})`);

  try {
    // Resolve redirects first
    url = await resolveUrl(url);
    const urlOrigin = new URL(url).origin;

    // Prepare options for worker
    const options = {
      chromeFlags: getChromeFlags(urlOrigin),
      logLevel: LOG_LEVEL,
      timeout: LIGHTHOUSE_TIMEOUT
    };

    // Execute in worker pool
    const result = await lighthouseWorkerPool.execute(taskId, url, device, 'html', options);

    console.log(`[${taskId}] Sending HTML report to client`);
    res.setHeader('Content-Type', 'text/html');
    res.send(result.report);
  } catch (error) {
    console.error(`[${taskId}] Error:`, error.message);
    console.error('Error stack:', error.stack);
    res.status(500).send(`Error generating report: ${error.message}<br><br>Check container logs for details: <code>docker logs lighthouse_docker</code>`);
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  const workerStats = lighthouseWorkerPool.getStats();
  res.status(200).json({
    status: 'healthy',
    version: VERSION,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    workerPool: workerStats
  });
});

// Worker pool status endpoint
app.get('/workers/status', (req, res) => {
  const stats = lighthouseWorkerPool.getStats();
  res.status(200).json({
    workerPool: stats,
    message: stats.activeWorkers === stats.maxWorkers
      ? `All ${stats.maxWorkers} workers are busy. ${stats.queueLength} tasks queued.`
      : `${stats.activeWorkers}/${stats.maxWorkers} workers active. ${stats.queueLength} tasks queued.`
  });
});

// Legacy queue status endpoint (redirects to workers status)
app.get('/queue/status', (req, res) => {
  res.redirect('/workers/status');
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
  let url = req.query.url;  // Changed from const to let to allow reassignment
  const metricsParam = req.query.metrics;
  const device = req.query.device || DEFAULT_DEVICE;

  if (!url) {
    return res.status(400).json({ error: 'Please provide a URL via the ?url= parameter' });
  }

  const taskId = `JSON-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log(`[${taskId}] API request received for: ${url} (device: ${device})`);

  try {
    // Resolve redirects first
    url = await resolveUrl(url);
    const urlOrigin = new URL(url).origin;

    // Prepare options for worker
    const options = {
      chromeFlags: getChromeFlags(urlOrigin),
      logLevel: LOG_LEVEL,
      timeout: LIGHTHOUSE_TIMEOUT
    };

    // Execute in worker pool
    const result = await lighthouseWorkerPool.execute(taskId, url, device, 'json', options);

    const lhr = result.lhr;
    console.log(`[${taskId}] API Report completed for`, lhr.finalUrl);

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
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Error generating report', message: error.message });
  }
});