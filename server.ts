import { Request, serve } from "https://deno.land/std/http/server.ts";
import { execute, ExecutionError } from "./executor.ts";
import { RunCodeSchema } from "./model/run-code.ts";

serve(
  async (req: Request) => {
    if (req.method !== "POST") {
      return new Response("Only POST", { status: 405 });
    }

    try {
      const json = await req.json();
      const parsed = RunCodeSchema.parse(json);

      const { result, logs } = await execute(parsed);
      return Response.json({ result, logs });
    } catch (e: any) {
      // If it's an ExecutionError (user code error), return 422 with stack trace and logs
      if (e instanceof ExecutionError) {
        return Response.json(
          {
            message: e.message,
            stack: e.stack,
            logs: e.logs,
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
