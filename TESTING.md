# Testing the Worker Pool Implementation

## Prerequisites

- Docker and Docker Compose installed
- `curl` and `jq` for testing (optional: `jq` for JSON formatting)
- Terminal access

## 1. Basic Functionality Test

### Start the Container

```bash
cd lighthouse-docker
docker-compose down
docker-compose up -d
```

### Verify Worker Pool is Running

```bash
curl http://localhost:3000/workers/status | jq
```

**Expected Output:**
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

✅ **Pass Criteria**: Returns 200 OK with worker pool stats

## 2. Single Request Test

### Send Single Request

```bash
time curl -s "http://localhost:3000/api/analyze?url=https://example.com" | jq '.url'
```

**Expected:**
- Takes ~30 seconds
- Returns Lighthouse results
- No errors

### Check Logs

```bash
docker logs lighthouse_docker | tail -20
```

**Look for:**
```
[JSON-xxxxx] API request received for: https://example.com
[WorkerPool] Spawning worker for task JSON-xxxxx. Active: 1/5
[Worker XXXXX] Starting task JSON-xxxxx for https://example.com
[Worker XXXXX] Chrome launched on port XXXXX
[Worker XXXXX] Task JSON-xxxxx completed successfully
[WorkerPool] Task JSON-xxxxx completed successfully
```

✅ **Pass Criteria**: 
- Request completes successfully
- Worker spawned and completed
- No performance mark errors

## 3. Concurrent Requests Test

### Send 3 Concurrent Requests

```bash
# Start timer
START=$(date +%s)

# Send 3 requests in parallel
curl -s "http://localhost:3000/api/analyze?url=https://google.com" > /tmp/result1.json &
PID1=$!
curl -s "http://localhost:3000/api/analyze?url=https://github.com" > /tmp/result2.json &
PID2=$!
curl -s "http://localhost:3000/api/analyze?url=https://example.com" > /tmp/result3.json &
PID3=$!

# Wait for all to complete
wait $PID1 $PID2 $PID3

# Calculate duration
END=$(date +%s)
DURATION=$((END - START))

echo "All 3 requests completed in $DURATION seconds"
cat /tmp/result1.json | jq '.url'
cat /tmp/result2.json | jq '.url'
cat /tmp/result3.json | jq '.url'
```

**Expected:**
- All complete in ~30-40 seconds (not 90 seconds)
- All return valid Lighthouse results
- No errors

### Check Worker Pool Status During Execution

In another terminal while requests are running:

```bash
watch -n 1 'curl -s http://localhost:3000/workers/status | jq'
```

**Expected to see:**
```json
{
  "workerPool": {
    "maxWorkers": 5,
    "activeWorkers": 3,
    "queueLength": 0,
    "totalProcessed": X,
    "totalFailed": 0,
    "activeTasks": ["JSON-xxx", "JSON-yyy", "JSON-zzz"]
  },
  "message": "3/5 workers active. 0 tasks queued."
}
```

✅ **Pass Criteria**:
- 3 workers active simultaneously
- All requests complete in ~30-40s
- No performance mark errors in logs

## 4. Queue Test (More Requests Than Workers)

### Send 8 Concurrent Requests

```bash
START=$(date +%s)

for i in {1..8}; do
  curl -s "http://localhost:3000/api/analyze?url=https://example$i.com" > /tmp/result$i.json &
done

wait

END=$(date +%s)
DURATION=$((END - START))

echo "All 8 requests completed in $DURATION seconds"
```

**Expected:**
- First 5 start immediately
- Next 3 queue and wait
- All complete in ~60 seconds (not 240 seconds)

### Check Logs for Queue Behavior

```bash
docker logs lighthouse_docker | grep -E "WorkerPool|queued"
```

**Look for:**
```
[WorkerPool] Spawning worker for task JSON-xxx. Active: 1/5
[WorkerPool] Spawning worker for task JSON-xxx. Active: 2/5
...
[WorkerPool] Spawning worker for task JSON-xxx. Active: 5/5
[WorkerPool] Task JSON-xxx queued. Active: 5/5, Queue: 1
[WorkerPool] Task JSON-xxx queued. Active: 5/5, Queue: 2
[WorkerPool] Task JSON-xxx queued. Active: 5/5, Queue: 3
[WorkerPool] Processing queued task JSON-xxx. Queue remaining: 2
```

✅ **Pass Criteria**:
- Max 5 workers active at once
- Excess requests queue properly
- All requests complete successfully

## 5. Performance Mark Error Test

### Goal: Verify NO Performance Mark Errors

Send many concurrent requests:

```bash
for i in {1..10}; do
  curl -s "http://localhost:3000/api/analyze?url=https://site$i.com" &
done

wait
```

### Check Logs for Errors

```bash
docker logs lighthouse_docker 2>&1 | grep -i "performance mark"
```

**Expected:**
- **NO** matches found
- If matches found with "retrying", that's OK (retry logic working)
- If matches found without retry, test FAILED

✅ **Pass Criteria**: No unhandled performance mark errors

## 6. Resource Usage Test

### Monitor Container Resources

```bash
docker stats lighthouse_docker --no-stream
```

**Expected (during 5 concurrent audits):**
- CPU: 200-500%
- Memory: 2-4GB (depending on MAX_CONCURRENT_AUDITS)

### Check for Memory Leaks

```bash
# Before any requests
docker stats lighthouse_docker --no-stream | awk 'NR==2 {print "Before: " $4}'

# Send 10 requests
for i in {1..10}; do
  curl -s "http://localhost:3000/api/analyze?url=https://example.com" > /dev/null &
done
wait

# After all requests (wait a bit for cleanup)
sleep 10
docker stats lighthouse_docker --no-stream | awk 'NR==2 {print "After: " $4}'
```

✅ **Pass Criteria**: Memory returns to baseline after requests complete

## 7. Error Handling Test

### Test Invalid URL

```bash
curl -s "http://localhost:3000/api/analyze?url=https://invalid-url-that-does-not-exist-12345.com" | jq
```

**Expected:**
- Returns error response
- Worker fails gracefully
- No crashes

### Check Failed Counter

```bash
curl -s http://localhost:3000/workers/status | jq '.workerPool.totalFailed'
```

✅ **Pass Criteria**: Counter increments, but service remains healthy

## 8. Configuration Test

### Change Worker Pool Size

Edit `docker-compose.yml`:
```yaml
environment:
  - MAX_CONCURRENT_AUDITS=2
```

Restart:
```bash
docker-compose restart
```

Verify:
```bash
curl -s http://localhost:3000/workers/status | jq '.workerPool.maxWorkers'
```

**Expected Output:** `2`

### Send 3 Concurrent Requests

```bash
for i in {1..3}; do
  curl -s "http://localhost:3000/api/analyze?url=https://site$i.com" &
done
```

Check status:
```bash
curl -s http://localhost:3000/workers/status | jq
```

**Expected:**
- `maxWorkers`: 2
- `activeWorkers`: 2
- `queueLength`: 1

✅ **Pass Criteria**: Only 2 workers active, 3rd request queued

## 9. Health Check Test

### Check Health Endpoint

```bash
curl -s http://localhost:3000/health | jq
```

**Expected:**
```json
{
  "status": "healthy",
  "version": "1.3.0",
  "uptime": 123,
  "timestamp": "2026-01-24T...",
  "workerPool": {
    "maxWorkers": 5,
    "activeWorkers": 0,
    ...
  }
}
```

✅ **Pass Criteria**: Returns 200 OK with worker pool stats

## 10. Stress Test (Optional)

### Send 50 Concurrent Requests

```bash
START=$(date +%s)

for i in {1..50}; do
  curl -s "http://localhost:3000/api/analyze?url=https://example.com" > /dev/null &
done

wait

END=$(date +%s)
DURATION=$((END - START))

echo "50 requests completed in $DURATION seconds"
echo "Average: $(($DURATION / 50)) seconds per request equivalent"
```

**Expected:**
- All complete successfully
- Duration: ~300 seconds (50 requests / 5 workers * 30s)
- No crashes or errors

### Monitor During Stress Test

```bash
# Terminal 1: Watch worker pool
watch -n 1 'curl -s http://localhost:3000/workers/status | jq'

# Terminal 2: Watch logs
docker logs lighthouse_docker -f

# Terminal 3: Watch resources
docker stats lighthouse_docker
```

✅ **Pass Criteria**: 
- All requests complete
- No crashes
- Memory stays reasonable
- Workers properly cycle through queue

## Test Results Summary

Create a checklist:

- [ ] Worker pool initializes correctly
- [ ] Single requests work
- [ ] Concurrent requests work (3 simultaneous)
- [ ] Queue works (8+ requests)
- [ ] No performance mark errors
- [ ] No memory leaks
- [ ] Error handling works
- [ ] Configuration changes work
- [ ] Health check returns correct data
- [ ] Stress test passes (optional)

## Troubleshooting

### If Tests Fail

1. **Check container is running:**
   ```bash
   docker ps | grep lighthouse
   ```

2. **Check logs for errors:**
   ```bash
   docker logs lighthouse_docker
   ```

3. **Verify files exist:**
   ```bash
   ls -la lighthouse-worker.js
   ```

4. **Check syntax:**
   ```bash
   node --check server.js
   node --check lighthouse-worker.js
   ```

5. **Reset everything:**
   ```bash
   docker-compose down
   docker-compose up -d --build
   ```

## Automated Test Script

Save this as `test.sh`:

```bash
#!/bin/bash

echo "🧪 Testing Lighthouse Worker Pool"
echo "=================================="

echo ""
echo "1️⃣  Checking worker pool status..."
curl -s http://localhost:3000/workers/status | jq '.workerPool.maxWorkers' && echo "✅ Worker pool initialized"

echo ""
echo "2️⃣  Testing single request..."
curl -s "http://localhost:3000/api/analyze?url=https://example.com&metrics=performance" | jq '.metrics.performance' > /dev/null && echo "✅ Single request works"

echo ""
echo "3️⃣  Testing concurrent requests..."
START=$(date +%s)
for i in {1..5}; do
  curl -s "http://localhost:3000/api/analyze?url=https://example.com&metrics=performance" > /dev/null &
done
wait
END=$(date +%s)
DURATION=$((END - START))
if [ $DURATION -lt 90 ]; then
  echo "✅ Concurrent requests work ($DURATION seconds)"
else
  echo "❌ Too slow ($DURATION seconds, expected < 90)"
fi

echo ""
echo "4️⃣  Checking for performance mark errors..."
ERRORS=$(docker logs lighthouse_docker 2>&1 | grep -i "performance mark" | grep -v "retrying" | wc -l)
if [ $ERRORS -eq 0 ]; then
  echo "✅ No performance mark errors"
else
  echo "❌ Found $ERRORS performance mark errors"
fi

echo ""
echo "5️⃣  Checking statistics..."
curl -s http://localhost:3000/workers/status | jq '{processed: .workerPool.totalProcessed, failed: .workerPool.totalFailed}'

echo ""
echo "🎉 Testing complete!"
```

Run it:
```bash
chmod +x test.sh
./test.sh
```

## Expected Test Duration

- Basic tests (1-5): ~2-3 minutes
- Full test suite (1-9): ~5-10 minutes
- With stress test (1-10): ~15-20 minutes

## Success Criteria

✅ **All tests pass**
✅ **No performance mark errors**
✅ **Concurrent execution works**
✅ **No memory leaks**
✅ **Proper queue behavior**

If all tests pass, the worker pool implementation is working correctly! 🎉
