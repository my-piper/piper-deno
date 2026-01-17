import {
  DEFAULT_TIMEOUT_MS,
  ExecutionError,
  type LogLevel,
  MAX_TIMEOUT_MS,
} from "./executor-common.ts";
import { RunCode } from "./model/run-code.ts";

export { ExecutionError };

const PER_WORKER_MEMORY_MB = +Deno.env.get("PER_WORKER_MEMORY_MB") || 128; // Memory limit per worker in MB

export function execute(runCode: RunCode): Promise<{
  result: unknown;
  logs: Array<{ ts: number; level: LogLevel; message: string }>;
}> {
  const requestedTimeout = runCode.timeout ?? DEFAULT_TIMEOUT_MS;
  const timeoutMs = Math.min(requestedTimeout, MAX_TIMEOUT_MS);

  return new Promise((resolve, reject) => {
    // Spawn a separate Deno process with memory limit
    const process = new Deno.Command("deno", {
      args: [
        "run",
        "--allow-net",
        "--allow-read",
        // Set V8 memory limit for THIS process only
        `--v8-flags=--max-old-space-size=${PER_WORKER_MEMORY_MB}`,
        new URL("./worker-process.ts", import.meta.url).href,
      ],
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    }).spawn();

    let isResolved = false;
    let timeoutId: number | undefined;

    // Set up timeout
    timeoutId = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        process.kill("SIGKILL");
        reject(
          new ExecutionError({
            message: "Execution timeout",
            code: "TIMEOUT_ERROR",
          }),
        );
      }
    }, timeoutMs);

    // Write input to process stdin
    const writer = process.stdin.getWriter();
    writer.write(new TextEncoder().encode(JSON.stringify(runCode)));
    writer.close();

    // Read output
    (async () => {
      try {
        const { stdout, stderr, success } = await process.output();

        if (isResolved) return;
        isResolved = true;
        if (timeoutId !== undefined) clearTimeout(timeoutId);

        const output = new TextDecoder().decode(stdout);
        const errorOutput = new TextDecoder().decode(stderr);

        if (!success) {
          // Check if it was killed due to memory
          if (
            errorOutput.includes("out of memory") ||
            errorOutput.includes("OOM")
          ) {
            reject(
              new ExecutionError({
                message: "Memory limit exceeded",
                code: "MEMORY_ERROR",
                stack: errorOutput,
              }),
            );
            return;
          }

          reject(
            new ExecutionError({
              message: "Process failed",
              stack: errorOutput,
            }),
          );
          return;
        }

        try {
          const result = JSON.parse(output);
          if (result.type === "success") {
            resolve({
              result: result.result,
              logs: result.logs || [],
            });
          } else {
            reject(
              new ExecutionError({
                message: result.error,
                stack: result.stack,
                code: result.code,
                logs: result.logs,
              }),
            );
          }
        } catch (e) {
          reject(
            new ExecutionError({
              message: "Failed to parse output",
              stack: String(e),
            }),
          );
        }
      } catch (e) {
        if (!isResolved) {
          isResolved = true;
          if (timeoutId !== undefined) clearTimeout(timeoutId);
          reject(
            new ExecutionError({
              message: "Process error",
              stack: String(e),
            }),
          );
        }
      }
    })();
  });
}
