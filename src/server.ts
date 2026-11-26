import { ExecutionError } from "./execution/common.ts";
import { execute as executeInProcess } from "./execution/process/executor.ts";
import { execute as executeInWorker } from "./execution/worker/executor.ts";
import {
  measureRun,
  recordInvalidRequest,
  startMetricsServer,
} from "./metrics.ts";
import { type RunCode, RunCodeSchema } from "./run-code.ts";

const PER_WORKER_MEMORY_MB = +(Deno.env.get("PER_WORKER_MEMORY_MB") || 128);
// Unset or empty disables the metrics listener
const METRICS_PORT = Number(Deno.env.get("METRICS_PORT") || 0);

console.log(
  `🚀 Server starting with configurable isolation (default: process, ${PER_WORKER_MEMORY_MB}M per worker)`,
);

if (METRICS_PORT) {
  startMetricsServer(METRICS_PORT);
}

Deno.serve(
  {
    hostname: "0.0.0.0",
    port: +(Deno.env.get("PORT") || 3333),
  },
  async (req: Request): Promise<Response> => {
    if (req.method !== "POST") {
      return new Response("Only POST", { status: 405 });
    }

    let parsed: RunCode;
    try {
      parsed = RunCodeSchema.parse(await req.json());
    } catch (e: any) {
      recordInvalidRequest();
      return Response.json({ error: e.message }, { status: 400 });
    }

    // Process isolation is the default; "none" selects Worker isolation
    const isolation = parsed.isolation === "none" ? "worker" : "process";
    const execute = isolation === "process"
      ? executeInProcess
      : executeInWorker;

    try {
      const { result, logs } = await measureRun(
        isolation,
        () => execute(parsed),
      );

      return Response.json({ result, logs });
    } catch (e: any) {
      // If it's an ExecutionError (user code error), return 422 with stack trace and logs
      if (e instanceof ExecutionError) {
        const { message, stack, code, logs } = e;
        return Response.json(
          {
            message,
            stack,
            code,
            logs,
          },
          { status: 422 },
        );
      }
      // For other errors, return 400
      return Response.json({ error: e.message }, { status: 400 });
    }
  },
);
