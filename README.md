# Deno Code Executor with Process Isolation

This is a secure code execution service that prevents malicious code (like infinite loops) from affecting other users.

## 🔒 Security Features

- **Process Isolation**: Each user request runs in a separate Deno process (128M memory limit per execution)
- **Timeout Protection**: Code execution is limited to 5 seconds (configurable, max 300s)
- **Memory Limits**: Container (2G) with per-process limits (128M per worker)
- **Forced Termination**: Processes are forcefully killed if they timeout or exceed memory
- **Concurrent Safety**: Multiple users can execute code simultaneously without affecting each other
- **Resource Cleanup**: Processes are automatically terminated and garbage collected
- **Attack Protection**: Malicious users cannot consume all memory or crash the service
- **Import Allowlist**: Scripts import modules only from Deno's default hosts plus `ALLOW_IMPORT_HOSTS`

📖 **See [GLOSSARY.md](./GLOSSARY.md) for the meaning of Worker vs Process isolation**

## 🚀 Quick Start

### Local Development

```bash
make install   # cache dependencies (requires deno)
make run       # start the server
make help      # list all targets (test, lint, check, docker-build, ...)
```

### Docker Compose

```bash
# From the project root
docker compose -f tools/compose/compose.yaml up deno
```

The server will be available at:

- Local: `http://127.0.0.1:3333`
- Docker: `http://0.0.0.0:9090`

## 📝 API Usage

### Execute Code

**Endpoint**: `POST /`

**Request Body**:

```json
{
  "script": "export function run(inputs) { return { result: 'success' }; }",
  "fn": "run",
  "payload": { "key": "value" },
  "timeout": 10000,
  "isolation": "process"
}
```

**Parameters**:

- `script` (string, required) - JavaScript code to execute
- `fn` (string, required) - Function name to call from the exported code
- `payload` (object, required) - Input data passed to the function
- `timeout` (number, optional) - Execution timeout in milliseconds
  - Default: 5000ms (5 seconds)
  - Maximum: 300000ms (300 seconds / 5 minutes)
  - Values above 300000ms will be capped at 300000ms
- `isolation` (string, optional) - Isolation mode
  - `"process"` (default) - Secure process isolation with 128M memory limit per worker
  - `"none"` - Faster execution with shared memory (less secure, use only for trusted code)

**Success Response**:

```json
{
  "result": { "result": "success" },
  "logs": [{ "ts": 1234567890, "level": "info", "message": "..." }]
}
```

**Error Response**:

```json
{
  "error": "Execution timeout"
}
```

### Buffer to Data URI Conversion with MIME Type Detection

The server automatically converts any `Uint8Array` (Buffer) objects in the result to data URIs with base64 encoding and **automatic MIME type detection**. This makes it easy to return binary data like images, files, or any binary content with the correct content type.

#### MIME Type Detection

The server detects MIME types using:

1. **Magic Numbers (File Signatures)** - For binary formats
2. **Content Analysis** - For text-based formats

**Supported MIME Types**:

- **Images**: PNG, JPEG, GIF, WebP, BMP, TIFF, **SVG**, AVIF
- **Videos**: MP4, WebM, FLV
- **Audio**: MP3, OGG, WAV
- **Documents**: PDF, ZIP, Office formats
- **Text**: JSON, XML, HTML, plain text
- **Archives**: GZIP, BZIP2, 7Z, RAR

> **Note**: SVG files are detected both by their magic number (`<svg`) and by content analysis (searching for `<svg` tag), supporting SVG files with or without XML declarations.

#### Examples

**Text Buffer** (auto-detected as `text/plain`):

```javascript
export function run(inputs) {
  return new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
}

// Server response
{
  "result": "data:text/plain;base64,SGVsbG8=",
  "logs": []
}
```

**PNG Image** (auto-detected as `image/png`):

```javascript
export function run(inputs) {
  // PNG signature
  return new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
}

// Server response
{
  "result": "data:image/png;base64,iVBORw0KGgo=",
  "logs": []
}
```

**JSON Buffer** (auto-detected as `application/json`):

```javascript
export function run(inputs) {
  const jsonText = JSON.stringify({ message: "Hello" });
  return new TextEncoder().encode(jsonText);
}

// Server response
{
  "result": "data:application/json;base64,eyJtZXNzYWdlIjoiSGVsbG8ifQ==",
  "logs": []
}
```

**SVG Image** (auto-detected as `image/svg+xml`):

```javascript
export function run(inputs) {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>';
  return new TextEncoder().encode(svg);
}

// Server response
{
  "result": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxjaXJjbGUgcj0iMTAiLz48L3N2Zz4=",
  "logs": []
}
```

**Nested Buffers**:

```javascript
export function run(inputs) {
  return {
    image: new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    metadata: {
      thumbnail: new Uint8Array([0xFF, 0xD8, 0xFF]) // JPEG
    }
  };
}

// Server response
{
  "result": {
    "image": "data:image/png;base64,iVBORw0KGgo=",
    "metadata": {
      "thumbnail": "data:image/jpeg;base64,/9j/"
    }
  },
  "logs": []
}
```

See `src/execution/buffer-to-data-uri.test.ts` for more examples, and
[ADR-0001](./docs/adr/0001-custom-mime-detection.md) for how MIME types are detected.

### Isolation Mode Examples

**Secure Process Isolation (Default)**:

```bash
curl -X POST http://localhost:3333 \
  -H "Content-Type: application/json" \
  -d '{
    "script": "export function main() { return { secure: true }; }",
    "fn": "main",
    "payload": {},
    "isolation": "process"
  }'
```

**Fast Execution (Worker Isolation, `"none"`)**:

```bash
curl -X POST http://localhost:3333 \
  -H "Content-Type: application/json" \
  -d '{
    "script": "export function main() { return { fast: true }; }",
    "fn": "main",
    "payload": {},
    "isolation": "none"
  }'
```

**Default (Process Isolation)**:

```bash
# Omitting "isolation" defaults to "process"
curl -X POST http://localhost:3333 \
  -H "Content-Type: application/json" \
  -d '{
    "script": "export function main() { return { default: true }; }",
    "fn": "main",
    "payload": {}
  }'
```

## 🧪 Testing

### Run All Tests

```bash
# Run all tests
deno task test

# Or manually (unit tests only; e2e lives in tests/e2e)
deno test --allow-net --allow-read --allow-env --allow-run --allow-write src/
```

### Run Specific Test Suites

```bash
# Unit tests (executor functionality)
deno task test:unit

# Concurrent execution tests
deno task test:concurrent

# End-to-end tests (HTTP server)
# Note: Server must be running on port 3333
deno task test:e2e
```

### Test Files

- **`src/execution/worker/executor.test.ts`** - Unit tests for code execution
  - Normal code execution
  - Async code execution
  - CPU-intensive code
  - Error handling
  - Infinite loop timeout
  - Missing function detection
  - Console log levels
  - Custom timeout

- **`src/execution/worker/concurrent.test.ts`** - Concurrent execution tests
  - Isolation test (normal + hacker + normal)
  - Multiple normal requests
  - Mixed fast and slow requests

- **`tests/e2e/server.test.ts`** - End-to-end tests (requires running server)
  - Normal code execution via HTTP
  - Infinite loop timeout via HTTP
  - Invalid request methods
  - Invalid request body
  - Missing function errors
  - Syntax errors
  - Runtime errors
  - Async code execution
  - Concurrent requests isolation

### Running End-to-End Tests

End-to-end tests require the server to be running:

```bash
# Terminal 1: Start the server (metrics tests expect METRICS_PORT=9464)
METRICS_PORT=9464 deno task start

# Terminal 2: Run end-to-end tests
deno task test:e2e
```

## 🎨 Code Quality

### Formatting

This project uses Deno's built-in formatter (based on dprint):

```bash
# Format all files
deno task fmt

# Check formatting without modifying files
deno task fmt:check
```

### Linting

This project uses Deno's built-in linter:

```bash
# Lint all files
deno task lint

# Auto-fix linting issues
deno task lint:fix
```

### Combined Check

Run all checks (formatting, linting, and type checking):

```bash
deno task check
```

### Configuration

- **Formatting**: Configured in `deno.json` under `fmt` section
- **Linting**: Configured in `deno.json` under `lint` section
- **EditorConfig**: `.editorconfig` for consistent editor settings

### Manual Testing with cURL

**Normal Code:**

```bash
curl -X POST http://127.0.0.1:3333 \
  -H "Content-Type: application/json" \
  -d '{
    "code": "export function run(inputs) { return { result: \"success\" }; }",
    "fn": "run",
    "payload": { "a": 1 }
  }'
```

**Infinite Loop (Should Timeout):**

```bash
curl -X POST http://127.0.0.1:3333 \
  -H "Content-Type: application/json" \
  -d '{
    "code": "export function run(inputs) { while(true) {}; return inputs; }",
    "fn": "run",
    "payload": { "a": 1 }
  }'
```

Expected response: `{"error":"Execution timeout"}`

## 🏗️ Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ HTTP POST
       ▼
┌─────────────────┐
│  server.ts      │
│  (Main Process) │
└────────┬────────┘
         │
         │ Creates Worker for each request
         ▼
┌────────────────────────────────────┐
│  Worker 1    Worker 2    Worker 3  │
│  (Isolated)  (Isolated)  (Isolated)│
│                                    │
│  User Code   User Code   User Code │
│  ✅ Normal   ⚠️ Infinite  ✅ Normal │
│              Loop                  │
└────────────────────────────────────┘
         │
         │ Timeout after 1s
         ▼
    Terminated ❌
```

## 📂 Files

```
src/
  server.ts                      HTTP entry point; picks an executor per isolation mode
  metrics.ts                     OpenTelemetry metrics and the /metrics listener
  run-code.ts                    Run request schema (zod)
  execution/
    common.ts                    ExecutionError, log levels, timeout limits
    buffer-to-data-uri.ts        Converts binary results to data: URIs
    worker/                      Worker isolation (isolation: "none")
      executor.ts                Pooled Web Workers
      worker.ts                  Web Worker that runs the script
    process/                     Process isolation (isolation: "process", default)
      executor.ts                Spawns one Deno process per run
      child.ts                   Child process that runs the script
    testdata/                    Fixtures for tests
tests/e2e/                       HTTP tests against a running server
docs/adr/                        Architecture decision records
GLOSSARY.md                      Domain terms
```

Unit tests live next to the code they test (`*.test.ts`).

### Scripts & Config

- `Makefile` - Common operations (`make help`)
- `deno.json` - Deno configuration and task definitions
- `README.md` - This documentation

## ⚙️ Configuration

### Timeout

- **Default**: 5000ms (5 seconds)
- **Maximum**: 300000ms (300 seconds / 5 minutes)
- **Configurable**: Users can specify timeout in the request

**Example with custom timeout**:

```bash
curl -X POST http://127.0.0.1:3333 \
  -H "Content-Type: application/json" \
  -d '{
    "code": "export function run(inputs) { return { result: \"success\" }; }",
    "fn": "run",
    "payload": { "a": 1 },
    "timeout": 10000
  }'
```

**In code**:

```typescript
await execute({
  code: "...",
  fn: "run",
  payload: {},
  timeout: 10000, // 10 seconds
});
```

### Import Hosts

Scripts given as a URL, and the modules they import, load only from Deno's
default hosts (deno.land, jsr.io, esm.sh, cdn.jsdelivr.net,
raw.githubusercontent.com, gist.githubusercontent.com) plus the hosts listed in
`ALLOW_IMPORT_HOSTS` (comma-separated `host:port`), e.g. Piper's internal
Package Registry:

```bash
ALLOW_IMPORT_HOSTS=registry:8085
# The registry requires a token; Deno sends it as a bearer token per host.
DENO_AUTH_TOKENS=<token>@registry:8085
```

Both isolation modes apply the list: child processes get `--allow-import=<hosts>`
and workers get it as their `import` permission, so the server itself runs with
`--allow-import --unstable-worker-options`.

### Metrics

When `METRICS_PORT` is set (the image sets `9464`), a separate listener
serves Prometheus metrics at `GET :METRICS_PORT/metrics`. The run port never
serves them. Leave `METRICS_PORT` unset or empty to disable the listener.
Metrics are recorded with the OpenTelemetry SDK and exported in the
Prometheus format (see [ADR 0003](docs/adr/0003-otel-metrics-prometheus-exporter.md)).
`target_info` carries `service_name="piper-deno"`.

| Metric | Type | Labels |
| --- | --- | --- |
| `deno_runs_total` | counter | `isolation`, `outcome` |
| `deno_run_duration_seconds` | histogram (0.01 to 300 s) | `isolation`, `outcome` |
| `deno_runs_in_flight` | gauge | `isolation` |
| `deno_worker_pool_workers` | gauge | `state` (`busy`, `idle`) |
| `deno_worker_temporary_total` | counter | (none) |
| `deno_worker_recycled_total` | counter | `reason` (`max_requests`, `timeout`, `error`) |
| `deno_memory_rss_bytes` | gauge | (none) |
| `deno_memory_heap_used_bytes` | gauge | (none) |
| `deno_memory_heap_total_bytes` | gauge | (none) |
| `deno_event_loop_lag_seconds` | gauge | (none) |

- `isolation` is `process` or `worker`. Requests rejected before parsing use
  `unknown`.
- `outcome` is one of `success`, `script_error`, `timeout`, `memory_limit`,
  `invalid_request`, `internal_error`.
- No label identifies the script.
- Runtime gauges cover the service process only, not child processes.
- `deno_worker_temporary_total` and `deno_worker_recycled_total` appear only
  after their first increment.

#### Dashboard

[`grafana/piper-deno.json`](grafana/piper-deno.json) is a Grafana (10+)
dashboard for these metrics: overview stats, runs by outcome and isolation,
duration percentiles and heatmap, the worker pool, and runtime memory and
event-loop lag. Import it through **Dashboards → New → Import** or provision
it from a file; its uid is `piper-deno`. It expects series labelled
`job="deno"` and `env`, as the piper-swarm vmagent scrape sets them, and picks
the Prometheus-compatible data source through its `datasource` variable.
"Failed runs" counts every outcome other than `success`; "Internal errors"
counts only `internal_error`, the failures caused by the service itself.

### Docker Resource Limits

In `tools/compose/compose.yaml`:

- Memory: 512MB
- CPU: 1.0 core

## 🛡️ How It Prevents `while(true) {}`

1. **Worker Creation**: Each request spawns a new Worker
2. **Timeout Timer**: A 1-second timeout is set
3. **Execution**: User code runs in the isolated Worker
4. **Termination**: If timeout expires, `worker.terminate()` forcefully kills the Worker
5. **Cleanup**: Worker is garbage collected

**Result**: The infinite loop is killed, and other users are unaffected!

## ✅ Test Results

```
✅ Normal Code - Works (18ms)
✅ Async Code - Works (112ms)
✅ CPU-Intensive Code - Works (22ms)
✅ Error Handling - Works
⚠️ Infinite Loop - Timeout (1000ms) ✅
🔒 Concurrent Requests - All isolated ✅
```

## Image processing

Scripts running in Worker isolation can import `sharp`:

```ts
import sharp from "sharp";

export async function run() {
  return await sharp({
    create: { width: 100, height: 100, channels: 4, background: "black" },
  }).png().toBuffer();
}
```

Send `isolation: "none"` in the run request. The returned Buffer becomes a PNG
`data:` URI, including when nested in an object. Sharp replaces ImageScript;
existing scripts importing `imagescript` must migrate. Process isolation (the
service default) does not grant the permissions Sharp needs.

Run `deno task install` before starting the service. Sharp's native dependencies
are installed into local `node_modules`; Docker installs the binaries for its
target architecture during the build.

## 🔐 Security Notes

- Worker isolation runs trusted scripts in the service process. Sharp's native
  code operates outside Deno's permission checks and can access the process's
  OS resources or crash the service. See [ADR 0002](docs/adr/0002-sharp-in-worker-isolation.md).
- Workers allow network and file reads, FFI, system information, and direct
  access to Sharp's `npm_package_config_libvips` and `MALLOC_ARENA_MAX`
  environment variables. Other direct environment reads remain denied.
- Process isolation keeps FFI and direct environment access disabled and denies
  reads under `/proc`. Both modes otherwise allow network and file reads.
- Workers share service memory. Docker limits apply to the container; V8 heap
  limits in Process isolation do not bound native allocations.
