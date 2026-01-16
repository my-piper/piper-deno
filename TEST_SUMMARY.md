# Test Summary

## Overview

This project includes comprehensive tests using Deno's built-in test framework to ensure the Worker-based code executor properly isolates and protects against malicious code.

## Test Results

```
✅ All 20 tests passed in 7 seconds

Unit Tests (executor.test.ts):        8 passed
Concurrent Tests (concurrent.test.ts): 3 passed
Integration Tests (server.test.ts):   9 passed
```

## Test Coverage

### 1. Unit Tests (`executor.test.ts`)

Tests the core executor functionality:

- ✅ **Normal code execution** - Verifies basic code execution works
- ✅ **Async code execution** - Tests async/await support
- ✅ **CPU-intensive code** - Ensures CPU-heavy code completes within timeout
- ✅ **Error handling** - Validates proper error propagation
- ✅ **Infinite loop timeout** - **CRITICAL**: Proves `while(true) {}` is terminated
- ✅ **Missing function detection** - Catches when exported function doesn't match
- ✅ **Multiple console log levels** - Tests log, info, warn, error capture
- ✅ **Custom timeout** - Verifies configurable timeout works

### 2. Concurrent Execution Tests (`concurrent.test.ts`)

Tests isolation between concurrent requests:

- ✅ **Isolation test** - **CRITICAL**: Proves normal users aren't blocked by hacker

  - Normal user 1: Success
  - Hacker (infinite loop): Timeout (isolated)
  - Normal user 2: Success
  - All completed in ~1 second (just the timeout duration)

- ✅ **Multiple normal requests** - Tests 5 concurrent normal requests

  - All succeed
  - Complete in parallel (~100ms, not 5×100ms)

- ✅ **Mixed fast and slow requests** - Tests different execution speeds
  - Fast requests complete quickly
  - Slow requests don't block fast ones
  - All complete successfully

### 3. Integration Tests (`server.test.ts`)

Tests the HTTP server endpoints:

- ✅ **Normal code execution via HTTP** - End-to-end success case
- ✅ **Infinite loop timeout via HTTP** - **CRITICAL**: HTTP endpoint returns timeout error
- ✅ **Invalid request method** - Rejects non-POST requests (405)
- ✅ **Invalid request body** - Validates request schema (400)
- ✅ **Missing function errors** - Returns error when function not found
- ✅ **Syntax errors** - Handles invalid JavaScript syntax
- ✅ **Runtime errors** - Propagates runtime errors properly
- ✅ **Async code execution** - Tests async code via HTTP
- ✅ **Concurrent requests isolation** - **CRITICAL**: HTTP-level isolation test

## Running Tests

### Quick Start

```bash
# Run all tests
deno task test

# Run specific test suites
deno task test:unit         # Unit tests only
deno task test:concurrent   # Concurrent tests only
deno task test:integration  # Integration tests (requires running server)
```

### Detailed Commands

```bash
# Unit tests (no server required)
deno test --allow-net --allow-read --allow-env executor.test.ts

# Concurrent tests (no server required)
deno test --allow-net --allow-read --allow-env concurrent.test.ts

# Integration tests (server must be running on port 3333)
# Terminal 1:
deno task start

# Terminal 2:
deno test --allow-net --allow-read --allow-env server.test.ts
```

## Key Test Scenarios

### Scenario 1: Infinite Loop Protection

**Test**: `executor - infinite loop timeout`

```typescript
const code = `
  export function greet(payload) {
    while(true) {}  // Infinite loop
    return { message: "Never reached" };
  }
`;

await execute({ code, fn: "greet", payload: {} });
// Throws: Error("Execution timeout")
```

**Result**: ✅ Worker terminated after 1 second

### Scenario 2: Concurrent Isolation

**Test**: `concurrent execution - isolation test`

```typescript
// 3 requests run simultaneously:
// 1. Normal user
// 2. Hacker with infinite loop
// 3. Another normal user

const results = await Promise.allSettled([
  execute({ code: normalCode1, ... }),
  execute({ code: hackerCode, ... }),  // while(true) {}
  execute({ code: normalCode2, ... }),
]);

// Results:
// [0]: fulfilled - Normal user 1 succeeded
// [1]: rejected - Hacker timed out
// [2]: fulfilled - Normal user 2 succeeded
```

**Result**: ✅ Normal users unaffected by hacker's infinite loop

### Scenario 3: HTTP Endpoint Protection

**Test**: `server - concurrent requests isolation`

```bash
# 3 concurrent HTTP requests
curl POST /  # Normal user 1
curl POST /  # Hacker (infinite loop)
curl POST /  # Normal user 2

# Responses:
# 1: {"result": {...}, "logs": [...]}  ✅
# 2: {"error": "Execution timeout"}    ⚠️
# 3: {"result": {...}, "logs": [...]}  ✅
```

**Result**: ✅ HTTP server remains responsive during attack

## Performance Metrics

| Test                | Duration | Notes                |
| ------------------- | -------- | -------------------- |
| Normal code         | ~11ms    | Fast execution       |
| Async code          | ~112ms   | Includes 100ms delay |
| CPU-intensive       | ~14ms    | 1M iterations        |
| Infinite loop       | ~1000ms  | Timeout duration     |
| 5 concurrent normal | ~148ms   | Parallel execution   |
| Isolation test      | ~1019ms  | Limited by timeout   |

## Security Validation

✅ **Isolation**: Each request runs in separate Worker
✅ **Termination**: Infinite loops forcefully killed
✅ **No Blocking**: Malicious code can't block other users
✅ **Resource Cleanup**: Workers properly terminated
✅ **Error Handling**: All errors caught and reported
✅ **Concurrent Safety**: Multiple users can execute simultaneously

## Continuous Testing

These tests should be run:

- ✅ Before every commit
- ✅ In CI/CD pipeline
- ✅ After any executor changes
- ✅ Before production deployment

## Test Maintenance

When adding new features:

1. Add unit tests to `executor.test.ts`
2. Add concurrent tests to `concurrent.test.ts` if relevant
3. Add integration tests to `server.test.ts` for HTTP endpoints
4. Update this summary document
