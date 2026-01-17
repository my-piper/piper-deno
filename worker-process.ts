/**
 * Worker process that runs in isolation with its own memory limit
 * This file is spawned as a separate Deno process
 */

import { type LogLevel } from "./executor-common.ts";

interface RunCode {
  script: string;
  fn: string;
  payload?: unknown;
  timeout?: number;
}

// Read input from stdin
const decoder = new TextDecoder();
const chunks: Uint8Array[] = [];
for await (const chunk of Deno.stdin.readable) {
  chunks.push(chunk);
}
const input = new Uint8Array(
  chunks.reduce((acc, chunk) => acc + chunk.length, 0),
);
let offset = 0;
for (const chunk of chunks) {
  input.set(chunk, offset);
  offset += chunk.length;
}
const inputStr = decoder.decode(input);

try {
  const runCode: RunCode = JSON.parse(inputStr);
  const { script, fn, payload } = runCode;

  const logs: Array<{ ts: number; level: LogLevel; message: string }> = [];

  const log = (level: LogLevel, ...a: unknown[]) => {
    logs.push({ ts: Date.now(), level, message: a.join(" ") });
  };

  // Override console to capture logs
  const originalConsole = globalThis.console;
  globalThis.console = {
    log: (...a: unknown[]) => log("log", ...a),
    info: (...a: unknown[]) => log("info", ...a),
    warn: (...a: unknown[]) => log("warn", ...a),
    error: (...a: unknown[]) => log("error", ...a),
  } as Console;

  let blobUrl: string | null = null;

  try {
    // Determine if script is a URL or code
    const isUrl =
      script.startsWith("http://") ||
      script.startsWith("https://") ||
      script.startsWith("file://");

    let moduleUrl: string;

    if (isUrl) {
      moduleUrl = script;
    } else {
      // Create a blob URL for the script
      const blob = new Blob([script], { type: "application/typescript" });
      blobUrl = URL.createObjectURL(blob);
      moduleUrl = blobUrl;
    }

    // Import the module
    const module = await import(moduleUrl);

    // Get the function
    const targetFn = module[fn];
    if (typeof targetFn !== "function") {
      throw new Error(`Function "${fn}" not found in module`);
    }

    // Execute the function
    const result = await targetFn(payload);

    // Restore console
    globalThis.console = originalConsole;

    // Clean up blob URL
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
    }

    // Output success
    console.log(
      JSON.stringify({
        type: "success",
        result,
        logs,
      }),
    );
  } catch (error: any) {
    // Restore console
    globalThis.console = originalConsole;

    // Clean up blob URL
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
    }

    // Output error
    console.log(
      JSON.stringify({
        type: "error",
        error: error instanceof Error ? error.message : String(error),
        ...(error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
            }
          : { message: String(error) }),
        ...("code" in error ? { code: error.code } : {}),
        logs,
      }),
    );
  }
} catch (e) {
  // Failed to parse input or other critical error
  console.error(
    JSON.stringify({
      type: "error",
      error: String(e),
      message: "Failed to process request",
    }),
  );
  Deno.exit(1);
}
