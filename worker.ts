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
  stack?: string;
}

// Listen for messages from the main thread
self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  if (e.data.type === "execute") {
    const { script, fn, payload } = e.data.data;

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
      // Check if script is a URL or code string
      const isUrl = script.startsWith("http://") ||
                    script.startsWith("https://") ||
                    script.startsWith("file://");

      let moduleUrl: string;

      if (isUrl) {
        // Use the URL directly
        moduleUrl = script;
      } else {
        // Create a blob URL from the user script code
        const blob = new Blob([script], { type: "application/javascript" });
        blobUrl = URL.createObjectURL(blob);
        moduleUrl = blobUrl;
      }

      // Import the user's code
      const mod = await import(moduleUrl);

      const action = mod[fn];

      if (typeof action !== "function") {
        throw new Error(`Code must export function ${fn}`);
      }

      // Execute the user's function
      const result = await action(payload);

      // Send success response back to main thread
      const response: WorkerResponse = {
        type: "success",
        result,
        logs,
      };
      self.postMessage(response);
    } catch (error) {
      // Send error response back to main thread
      const response: WorkerResponse = {
        type: "error",
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        logs,
      };
      self.postMessage(response);
    } finally {
      // Cleanup
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
      globalThis.console = originalConsole;
    }
  }
};
