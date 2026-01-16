import { RunCode } from "./model/run-code.ts";

type LogLevel = "log" | "info" | "warn" | "error";

interface WorkerMessage {
  type: "execute";
  data: RunCode;
}

interface WorkerResponse {
  type: "success" | "error";
  result?: unknown;
  logs?: Array<{ ts: number; level: LogLevel; message: string }>;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 5000; // 5 seconds
const MAX_TIMEOUT_MS = 300000; // 300 seconds (5 minutes)

export async function execute(runCode: RunCode): Promise<{
  result: unknown;
  logs: Array<{ ts: number; level: LogLevel; message: string }>;
}> {
  // Use timeout from request, default to 5 seconds, max 300 seconds
  const requestedTimeout = runCode.timeout ?? DEFAULT_TIMEOUT_MS;
  const timeoutMs = Math.min(requestedTimeout, MAX_TIMEOUT_MS);

  return new Promise((resolve, reject) => {
    // Create a new worker for this execution (isolation)
    // deno-lint-ignore no-explicit-any
    const worker = new (globalThis as any).Worker(
      new URL("./worker.ts", import.meta.url).href,
      {
        type: "module",
      }
    );

    let isResolved = false;
    const timers: { timeout: ReturnType<typeof setTimeout> | undefined } = {
      timeout: undefined,
    };

    // Set up timeout to terminate the worker
    timers.timeout = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        worker.terminate(); // Forcefully kill the worker
        reject(new Error("Execution timeout"));
      }
    }, timeoutMs);

    // Listen for messages from the worker
    // deno-lint-ignore no-explicit-any
    worker.onmessage = (e: any) => {
      if (isResolved) {
        return;
      }
      isResolved = true;

      if (timers.timeout !== undefined) {
        clearTimeout(timers.timeout);
      }
      worker.terminate(); // Clean up the worker

      const data = e.data as WorkerResponse;
      if (data.type === "success") {
        resolve({
          result: data.result,
          logs: data.logs || [],
        });
      } else {
        reject(new Error(data.error || "Unknown error"));
      }
    };

    // Handle worker errors
    // deno-lint-ignore no-explicit-any
    worker.onerror = (error: any) => {
      if (isResolved) {
        return;
      }
      isResolved = true;

      if (timers.timeout !== undefined) {
        clearTimeout(timers.timeout);
      }
      worker.terminate();
      reject(new Error(`Worker error: ${error.message || "Unknown error"}`));
    };

    // Send the code to the worker for execution
    const message: WorkerMessage = {
      type: "execute",
      data: runCode,
    };
    worker.postMessage(message);
  });
}
