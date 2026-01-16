import { Request, serve } from "https://deno.land/std/http/server.ts";
import { execute } from "./executor.ts";
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
      return Response.json({ error: e.message }, { status: 400 });
    }
  },
  {
    hostname: "0.0.0.0",
    port: process.env["PORT"] ? parseInt(process.env["PORT"]) : 3333,
  }
);
