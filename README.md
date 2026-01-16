# Deno Code Executor with Worker Isolation

This is a secure code execution service that prevents malicious code (like infinite loops) from affecting other users.

## 🔒 Security Features

- **Worker Isolation**: Each user request runs in a separate Worker thread
- **Timeout Protection**: Code execution is limited to 1 second (configurable)
- **Forced Termination**: Workers can be forcefully killed if they timeout
- **Concurrent Safety**: Multiple users can execute code simultaneously without blocking each other
- **Resource Cleanup**: Workers are automatically terminated and garbage collected

## 🚀 Quick Start

### Local Development

```bash
# Start the server
./start.sh

# Or manually:
deno run --allow-net --allow-read --allow-env server.ts
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
  "code": "export function run(inputs) { return { result: 'success' }; }",
  "fn": "run",
  "payload": { "key": "value" },
  "timeout": 10000
}
```

**Parameters**:

- `code` (string, required) - JavaScript code to execute
- `fn` (string, required) - Function name to call from the exported code
- `payload` (object, required) - Input data passed to the function
- `timeout` (number, optional) - Execution timeout in milliseconds
  - Default: 5000ms (5 seconds)
  - Maximum: 300000ms (300 seconds / 5 minutes)
  - Values above 300000ms will be capped at 300000ms

**Success Response**:

```json
{
  "result": { "result": "success" },
  "logs": [{ "ts": 1234567890, "level": "log", "message": "..." }]
}
```

**Error Response**:

```json
{
  "error": "Execution timeout"
}
```

## 🧪 Testing

### Run All Tests

```bash
# Run all tests
deno task test

# Or manually
deno test --allow-net --allow-read --allow-env
```

### Run Specific Test Suites

```bash
# Unit tests (executor functionality)
deno task test:unit

# Concurrent execution tests
deno task test:concurrent

# Integration tests (HTTP server)
# Note: Server must be running on port 3333
deno task test:integration
```

### Test Files

- **`executor.test.ts`** - Unit tests for code execution

  - Normal code execution
  - Async code execution
  - CPU-intensive code
  - Error handling
  - Infinite loop timeout
  - Missing function detection
  - Console log levels
  - Custom timeout

- **`concurrent.test.ts`** - Concurrent execution tests

  - Isolation test (normal + hacker + normal)
  - Multiple normal requests
  - Mixed fast and slow requests

- **`server.test.ts`** - Integration tests (requires running server)
  - Normal code execution via HTTP
  - Infinite loop timeout via HTTP
  - Invalid request methods
  - Invalid request body
  - Missing function errors
  - Syntax errors
  - Runtime errors
  - Async code execution
  - Concurrent requests isolation

### Running Integration Tests

Integration tests require the server to be running:

```bash
# Terminal 1: Start the server
deno task start

# Terminal 2: Run integration tests
deno task test:integration
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
- **Prettier**: `.prettierrc.json` for editor compatibility
- **EditorConfig**: `.editorconfig` for consistent editor settings
- **ESLint**: `.eslintrc.json` for ESLint compatibility (references Deno rules)

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

### Source Files

- `server.ts` - HTTP server that handles requests
- `executor.ts` - Worker-based code executor with timeout protection
- `worker.ts` - Worker script that runs user code in isolation
- `model/run-code.ts` - Request validation schema

### Test Files

- `executor.test.ts` - Unit tests for executor functionality
- `concurrent.test.ts` - Concurrent execution and isolation tests
- `server.test.ts` - Integration tests for HTTP server

### Scripts & Config

- `start.sh` - Local development startup script
- `deno.json` - Deno configuration and task definitions
- `README.md` - This documentation
- `TEST_SUMMARY.md` - Detailed test results and coverage

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

## 🔐 Security Notes

- Workers run with minimal permissions
- No file system access for user code
- No network access for user code
- Memory and CPU limits enforced by Docker
- Each request is completely isolated
