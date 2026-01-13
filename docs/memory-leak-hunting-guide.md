# Memory Leak Hunting Guide

This guide captures a practical workflow for finding slow memory leaks in a long-running process.

## Backend

### 1) Reproduce in a controlled window
- Run a consistent workload long enough for memory to grow (30-120 minutes for slow leaks).
- Keep the process stable (no restarts), and capture timestamps for notable actions.

### 2) Watch memory at two levels
- In-process: log `process.memoryUsage()` periodically (rss, heapTotal, heapUsed, external).
- OS view: `ps`, `top`, or `smem` to verify the process-level footprint.
- Heuristic: if heapUsed is near RSS and both grow, it is likely a real heap leak; if RSS grows while heapUsed stays flat, look for native/external or fragmentation.

### 3) Run with the inspector
- Start Node with debugging enabled:
  - `node --inspect=127.0.0.1:9230 --track-heap-objects <cmd>`
  - Optional: `--expose-gc` so you can force GC before snapshots.
- Connect Chrome DevTools:
  - Visit `chrome://inspect`, add `localhost:9230`, then open the Node target.

### 3a) NODE_OPTIONS equivalents
- If your process is started indirectly, use `NODE_OPTIONS`:
  - `NODE_OPTIONS="--inspect=127.0.0.1:9230 --track-heap-objects --expose-gc"`
- If the inspector port is already in use, change it:
  - `NODE_OPTIONS="--inspect=127.0.0.1:9231 --track-heap-objects --expose-gc"`

### 4) Heap snapshot workflow
- Warm up the app, then take Snapshot A (baseline).
- Reproduce the leak for a while, then take Snapshot B and Snapshot C.
- Use the **Comparison** view and sort by **Size Delta** or **Retained Size**.
- Drill into large growth categories (Strings, Arrays, Maps, custom classes).
- In the **Retainers** panel, follow why the object is still reachable.

### 5) Validate a hypothesis
- If you suspect a cache or map, clear it at runtime and see if heap drops after GC.
- Add counters (map sizes, LRU totals, session counts) and log them periodically.
- Disable a subsystem to see if growth stops; this isolates the source quickly.

### 6) Reduce noise in snapshots
- Take snapshots from the same running process.
- Prefer GC before snapshots (`global.gc()` when `--expose-gc` is enabled).
- Avoid large unrelated workloads between snapshots.

### 7) Preserve artifacts
- Save snapshots with timestamps.
- Keep the log slice around snapshot times so you can correlate events to allocations.

### 8) Common leak culprits
- Unbounded caches (LRU without size/entry caps, maps keyed by session or path).
- Event listeners or timers that never get removed.
- Storing full serialized documents or large strings repeatedly.
- Accidental retention via closures or global registries.
