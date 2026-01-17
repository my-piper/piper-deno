import { Request, serve } from "https://deno.land/std/http/server.ts";
import {
  execute as executeIsolated,
  ExecutionError as ExecutionErrorIsolated,
} from "./executor-isolated.ts";
import {
  execute as executeNone,
  ExecutionError as ExecutionErrorNone,
} from "./executor.ts";
import { RunCodeSchema } from "./model/run-code.ts";

const PER_WORKER_MEMORY_MB = +(Deno.env.get("PER_WORKER_MEMORY_MB") || 128);

console.log(
  `🚀 Server starting with configurable isolation (default: process, ${PER_WORKER_MEMORY_MB}M per worker)`,
);

serve(
  async (req: Request) => {
    if (req.method !== "POST") {
      return new Response("Only POST", { status: 405 });
    }

    try {
      const json = await req.json();
      const parsed = RunCodeSchema.parse(json);

      // Choose executor based on isolation mode (default: "process")
      const isolationMode = parsed.isolation ?? "process";
      const execute =
        isolationMode === "process" ? executeIsolated : executeNone;

      const { result, logs } = await execute(parsed);

      // Buffer-to-data-URI conversion is now handled inside each executor:
      // - For "process" isolation: done in worker-process.ts before JSON serialization
      // - For "none" isolation: done in executor.ts after receiving result from worker

      return Response.json({ result, logs });
    } catch (e: any) {
      // If it's an ExecutionError (user code error), return 422 with stack trace and logs
      if (
        e instanceof ExecutionErrorIsolated ||
        e instanceof ExecutionErrorNone
      ) {
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
  {
    hostname: "0.0.0.0",
    port: +(Deno.env.get("PORT") || 3333),
  },
);
