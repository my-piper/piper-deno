import { Request, serve } from "https://deno.land/std/http/server.ts";
import { execute, ExecutionError } from "./executor.ts";
import { RunCodeSchema } from "./model/run-code.ts";
import { convertBuffersToDataUris } from "./utils/buffer-to-data-uri.ts";

serve(
  async (req: Request) => {
    if (req.method !== "POST") {
      return new Response("Only POST", { status: 405 });
    }

    try {
      const json = await req.json();
      const parsed = RunCodeSchema.parse(json);

      const { result, logs } = await execute(parsed);
      // Convert any Buffer objects in the result to data URIs
      const convertedResult = convertBuffersToDataUris(result);
      return Response.json({ result: convertedResult, logs });
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
  {
    hostname: "0.0.0.0",
    port: +process.env["PORT"] || 3333,
  },
);
