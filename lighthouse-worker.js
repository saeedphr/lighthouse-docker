// Lighthouse Worker - Runs in a separate process to avoid marky global state conflicts
// Each worker has its own isolated global state

const lighthouse = require('lighthouse').default;
const chromeLauncher = require('chrome-launcher');

// Listen for messages from parent process
process.on('message', async (message) => {
  const { taskId, url, device, outputFormat, options } = message;
  
  console.log(`[Worker ${process.pid}] Starting task ${taskId} for ${url}`);
  
  let chrome;
  try {
    // Launch Chrome
    chrome = await chromeLauncher.launch({
      chromeFlags: options.chromeFlags
    });

    console.log(`[Worker ${process.pid}] Chrome launched on port ${chrome.port}`);

    // Small delay to ensure Chrome is ready
    await new Promise(resolve => setTimeout(resolve, 1500));

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

    const lighthouseOptions = {
      logLevel: options.logLevel || 'info',
      output: outputFormat,
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      port: chrome.port,
      formFactor: deviceSettings.formFactor,
      screenEmulation: deviceSettings.screenEmulation,
      throttling: deviceSettings.throttling,
      preset: 'lighthouse:default',
      skipAboutBlank: false,
      maxWaitForLoad: 45000,
      maxWaitForFcp: 30000,
      maxWaitForLoadIdle: 2000
    };

    // Run Lighthouse with retry logic
    let runnerResult;
    let retries = 2;
    while (retries >= 0) {
      try {
        runnerResult = await lighthouse(url, lighthouseOptions);
        break;
      } catch (error) {
        const isPerformanceMarkError = error.message && (
          error.message.includes('performance mark') ||
          error.message.includes('lh:runner:gather') ||
          error.message.includes('lh:driver:navigate') ||
          error.message.includes('lh:runner')
        );
        
        if (isPerformanceMarkError && retries > 0) {
          console.log(`[Worker ${process.pid}] Performance mark error, retrying... (${retries} left)`);
          retries--;
          await new Promise(resolve => setTimeout(resolve, 3000));
          continue;
        }
        throw error;
      }
    }

    if (!runnerResult || !runnerResult.lhr) {
      throw new Error('Lighthouse failed to generate report');
    }

    console.log(`[Worker ${process.pid}] Task ${taskId} completed successfully`);

    // Send result back to parent
    process.send({
      success: true,
      taskId,
      report: runnerResult.report,
      lhr: runnerResult.lhr
    });

  } catch (error) {
    console.error(`[Worker ${process.pid}] Task ${taskId} failed:`, error.message);
    
    // Send error back to parent
    process.send({
      success: false,
      taskId,
      error: error.message,
      stack: error.stack
    });
  } finally {
    if (chrome) {
      await chrome.kill();
    }
    // Exit the worker process after completing the task
    process.exit(0);
  }
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error(`[Worker ${process.pid}] Uncaught exception:`, error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error(`[Worker ${process.pid}] Unhandled rejection:`, error);
  process.exit(1);
});

console.log(`[Worker ${process.pid}] Ready and waiting for tasks`);
