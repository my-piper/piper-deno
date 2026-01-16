import { z } from "https://esm.sh/zod@3.22.4";

export const RunCodeSchema = z.object({
  script: z.string().min(1),
  fn: z.string().min(1),
  payload: z.record(z.any()),
  timeout: z.number().int().min(1).optional(), // Optional timeout in milliseconds (will be capped at 300 seconds in executor)
});

export type RunCode = z.infer<typeof RunCodeSchema>;
