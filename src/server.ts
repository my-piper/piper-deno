import { ExecutionError } from "./execution/common.ts";
import { execute as executeInProcess } from "./execution/process/executor.ts";
import { execute as executeInWorker } from "./execution/worker/executor.ts";
import { RunCodeSchema } from "./run-code.ts";

const PER_WORKER_MEMORY_MB = +(Deno.env.get("PER_WORKER_MEMORY_MB") || 128);

console.log(
  `🚀 Server starting with configurable isolation (default: process, ${PER_WORKER_MEMORY_MB}M per worker)`,
);

Deno.serve(
  {
    hostname: "0.0.0.0",
    port: +(Deno.env.get("PORT") || 3333),
  },
  async (req: Request): Promise<Response> => {
    if (req.method !== "POST") {
      return new Response("Only POST", { status: 405 });
    }

    try {
      const json = await req.json();
      const parsed = RunCodeSchema.parse(json);

      // Process isolation is the default; "none" selects Worker isolation
      const isolationMode = parsed.isolation ?? "process";
      const execute = isolationMode === "process"
        ? executeInProcess
        : executeInWorker;

      const { result, logs } = await execute(parsed);

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
      // For other errors (validation, timeout, etc.), return 400
      return Response.json({ error: e.message }, { status: 400 });
    }
  },
);
