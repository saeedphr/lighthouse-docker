# Quick Start: Worker Pool Implementation

## What Changed

✅ **Worker Pool**: Replaces sequential queue with concurrent worker processes
✅ **Concurrent Audits**: Run up to 5 audits simultaneously (configurable)
✅ **No More Performance Mark Errors**: Each worker has isolated global state

## Quick Setup

### 1. Restart Your Container

```bash
docker-compose down
docker-compose up -d
```

### 2. Check It's Working

```bash
curl http://localhost:3000/workers/status
```

Expected response:
```json
{
  "workerPool": {
    "maxWorkers": 5,
    "activeWorkers": 0,
    "queueLength": 0,
    "totalProcessed": 0,
    "totalFailed": 0,
    "activeTasks": []
  },
  "message": "0/5 workers active. 0 tasks queued."
}
```

### 3. Test Concurrent Requests

```bash
# Send 3 requests simultaneously
curl "http://localhost:3000/api/analyze?url=https://google.com" &
curl "http://localhost:3000/api/analyze?url=https://github.com" &
curl "http://localhost:3000/api/analyze?url=https://example.com" &
```

Watch the logs:
```bash
docker logs lighthouse_docker -f
```

You should see:
```
[WorkerPool] Spawning worker for task JSON-xxx. Active: 1/5
[WorkerPool] Spawning worker for task JSON-yyy. Active: 2/5
[WorkerPool] Spawning worker for task JSON-zzz. Active: 3/5
[Worker 12345] Starting task JSON-xxx for https://google.com
[Worker 12346] Starting task JSON-yyy for https://github.com
[Worker 12347] Starting task JSON-zzz for https://example.com
```

## Configuration

### Adjust Concurrent Workers

Edit `docker-compose.yml`:

```yaml
environment:
  - MAX_CONCURRENT_AUDITS=5  # Change this number
```

Or set environment variable:
```bash
export MAX_CONCURRENT_AUDITS=10
docker-compose up -d
```

## Monitoring

### Real-time Worker Status

```bash
# Linux/Mac
watch -n 1 'curl -s http://localhost:3000/workers/status | jq'

# Windows PowerShell
while($true){cls;curl http://localhost:3000/workers/status | jq;sleep 1}
```

### View Logs

```bash
docker logs lighthouse_docker -f
```

Look for:
- `[WorkerPool]` - Worker pool management logs
- `[Worker XXXX]` - Individual worker logs
- `[HTML-xxx]` or `[JSON-xxx]` - Task tracking logs

## Files Added

- **lighthouse-worker.js** - Worker process script (runs Lighthouse in isolation)
- **WORKER_POOL.md** - Detailed documentation
- **QUICKSTART.md** - This file

## Files Modified

- **server.js** - Added LighthouseWorkerPool class and updated endpoints
- **docker-compose.yml** - Added MAX_CONCURRENT_AUDITS environment variable
- **README.md** - Updated configuration section

## Troubleshooting

### Still Getting Performance Mark Errors?

1. **Restart the container:**
   ```bash
   docker-compose restart
   ```

2. **Check logs for worker pool messages:**
   ```bash
   docker logs lighthouse_docker | grep WorkerPool
   ```

3. **Verify worker pool is active:**
   ```bash
   curl http://localhost:3000/health
   ```
   Should show `workerPool` in the response.

### High Memory Usage?

Reduce concurrent workers:
```yaml
environment:
  - MAX_CONCURRENT_AUDITS=2
```

Each worker uses ~500MB RAM.

### Workers Not Starting?

Check container logs:
```bash
docker logs lighthouse_docker
```

Ensure:
- `SYS_ADMIN` capability is set
- Sufficient memory (2GB minimum)
- `lighthouse-worker.js` file exists

## Verification Checklist

- [ ] Container restarted successfully
- [ ] `/workers/status` endpoint returns worker pool stats
- [ ] Logs show `[WorkerPool]` messages
- [ ] Multiple concurrent requests work
- [ ] No performance mark errors in logs
- [ ] Worker count matches MAX_CONCURRENT_AUDITS

## Performance Comparison

**Before (Sequential Queue):**
- 5 requests = 150 seconds (30s each, sequential)

**After (Worker Pool with 5 Workers):**
- 5 requests = 30 seconds (all parallel)

**🎉 5x faster for batch operations!**

## Next Steps

1. ✅ Test with your workload
2. ✅ Monitor memory usage: `docker stats lighthouse_docker`
3. ✅ Adjust `MAX_CONCURRENT_AUDITS` based on results
4. ✅ See [WORKER_POOL.md](WORKER_POOL.md) for advanced configuration

## Support

- Documentation: [WORKER_POOL.md](WORKER_POOL.md)
- GitHub Issues: Report problems with logs from `/workers/status`
- Include task IDs from logs when reporting issues
