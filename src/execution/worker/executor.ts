import {
  DEFAULT_TIMEOUT_MS,
  ExecutionError,
  type LogLevel,
  MAX_TIMEOUT_MS,
} from "../common.ts";
import { RunCode } from "../../run-code.ts";
import { convertBuffersToDataUris } from "../buffer-to-data-uri.ts";
import { importHosts } from "../imports.ts";
import {
  observeWorkerPool,
  recordRecycledWorker,
  recordTemporaryWorker,
  type RecycleReason,
} from "../../metrics.ts";

interface WorkerMessage {
  type: "execute";
  data: RunCode;
}

interface WorkerResponse {
  type: "success" | "error";
  result?: unknown;
  message?: string;
  code?: string;
  stack?: string;
  logs?: Array<{ ts: number; level: LogLevel; message: string }>;
}

// Worker pool for reusing workers (only for isolation="none")
const WORKER_POOL_SIZE = 5; // Number of workers to keep warm
const MAX_REQUESTS_PER_WORKER = 100; // Recycle workers after N requests
const workerPool: Array<{
  worker: Worker;
  busy: boolean;
  requestCount: number;
}> = [];

observeWorkerPool(() => {
  const busy = workerPool.filter((w) => w.busy).length;
  return { busy, idle: workerPool.length - busy };
});

// Worker isolation is for trusted scripts: Sharp's native addon shares the
// service process and runs outside Deno's permission checks (ADR 0002).
// Direct environment access stays limited to Sharp's runtime configuration;
// Piper supplies a node's Variables in the payload. Import permissions need
// --unstable-worker-options and --allow-import on the parent.
function workerOptions(): WorkerOptions {
  return {
    type: "module",
    // @ts-ignore: `deno` worker options need --unstable-worker-options
    deno: {
      permissions: {
        net: true,
        read: true,
        env: ["npm_package_config_libvips", "MALLOC_ARENA_MAX"],
        ffi: true,
        sys: true,
        import: importHosts(),
      },
    },
  };
}

function getOrCreateWorker(): {
  worker: Worker;
  shouldRecycle: boolean;
} {
  // Try to find an idle worker
  const idle = workerPool.find((w) => !w.busy);
  if (idle) {
    idle.busy = true;
    idle.requestCount++;
    const shouldRecycle = idle.requestCount >= MAX_REQUESTS_PER_WORKER;
    return { worker: idle.worker, shouldRecycle };
  }

  // Create a new worker if pool not full
  if (workerPool.length < WORKER_POOL_SIZE) {
    // deno-lint-ignore no-explicit-any
    const worker = new (globalThis as any).Worker(
      new URL("./worker.ts", import.meta.url).href,
      workerOptions(),
    ) as Worker;

    const poolEntry = { worker, busy: true, requestCount: 1 };
    workerPool.push(poolEntry);
    return { worker, shouldRecycle: false };
  }

  // Pool is full and all workers are busy - create a temporary worker
  // deno-lint-ignore no-explicit-any
  const worker = new (globalThis as any).Worker(
    new URL("./worker.ts", import.meta.url).href,
    workerOptions(),
  ) as Worker;
  recordTemporaryWorker();
  return { worker, shouldRecycle: true }; // Will be terminated after use
}

// `recycle` names why the worker must go; undefined returns it to the pool
function releaseWorker(worker: Worker, recycle?: RecycleReason): void {
  const poolEntry = workerPool.find((w) => w.worker === worker);

  if (poolEntry) {
    if (recycle) {
      // Remove from pool and terminate
      const index = workerPool.indexOf(poolEntry);
      workerPool.splice(index, 1);
      worker.terminate();
      recordRecycledWorker(recycle);
    } else {
      // Mark as idle for reuse
      poolEntry.busy = false;
    }
  } else {
    // Temporary worker - just terminate
    worker.terminate();
  }
}

export function execute(runCode: RunCode): Promise<{
  result: unknown;
  logs: Array<{ ts: number; level: LogLevel; message: string }>;
}> {
  // Use timeout from request, default to 5 seconds, max 300 seconds
  const requestedTimeout = runCode.timeout ?? DEFAULT_TIMEOUT_MS;
  const timeoutMs = Math.min(requestedTimeout, MAX_TIMEOUT_MS);

  return new Promise((resolve, reject) => {
    // Get a worker from the pool (or create a new one)
    const { worker, shouldRecycle } = getOrCreateWorker();

    let isResolved = false;
    const timers: { timeout: ReturnType<typeof setTimeout> | undefined } = {
      timeout: undefined,
    };

    // Set up timeout to terminate the worker
    timers.timeout = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        releaseWorker(worker, "timeout"); // Force recycle on timeout
        // The worker is gone, so its logs cannot be recovered
        reject(
          new ExecutionError({
            message: "Execution timeout",
            code: "TIMEOUT_ERROR",
          }),
        );
      }
    }, timeoutMs);

    // Listen for messages from the worker
    // deno-lint-ignore no-explicit-any
    const onMessage = (e: any) => {
      if (isResolved) {
        return;
      }
      isResolved = true;

      if (timers.timeout !== undefined) {
        clearTimeout(timers.timeout);
      }

      // Clean up event listeners
      worker.onmessage = () => {};
      worker.onerror = () => {};

      const data = e.data as WorkerResponse;
      if (data.type === "success") {
        // Convert any Uint8Array buffers to data URIs
        // (for isolation="none", conversion happens here in the executor)
        const convertedResult = convertBuffersToDataUris(data.result);

        // Release worker back to pool (or terminate if should recycle)
        releaseWorker(worker, shouldRecycle ? "max_requests" : undefined);

        resolve({
          result: convertedResult,
          logs: data.logs || [],
        });
      } else {
        const { message, stack, code, logs } = data;

        // On error, always recycle the worker
        releaseWorker(worker, "error");

        reject(
          new ExecutionError({
            message,
            stack,
            code,
            logs,
          }),
        );
      }
    };

    // Handle worker errors
    // deno-lint-ignore no-explicit-any
    const onError = (error: any) => {
      if (isResolved) {
        return;
      }
      isResolved = true;

      if (timers.timeout !== undefined) {
        clearTimeout(timers.timeout);
      }

      // Clean up event listeners
      worker.onmessage = () => {};
      worker.onerror = () => {};

      // On error, always recycle the worker
      releaseWorker(worker, "error");

      reject(new Error(`Worker error: ${error.message || "Unknown error"}`));
    };

    worker.onmessage = onMessage;
    worker.onerror = onError;

    // Send the code to the worker for execution
    const message: WorkerMessage = {
      type: "execute",
      data: runCode,
    };
    worker.postMessage(message);
  });
}
