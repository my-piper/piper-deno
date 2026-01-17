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
import { convertBuffersToDataUris } from "./utils/buffer-to-data-uri.ts";

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
      // Convert any Buffer objects in the result to data URIs
      const convertedResult = convertBuffersToDataUris(result);
      return Response.json({ result: convertedResult, logs });
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
