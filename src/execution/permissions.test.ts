import { assertRejects } from "@std/assert";
import { execute as executeInWorker } from "./worker/executor.ts";
import { execute as executeInProcess } from "./process/executor.ts";

// Piper sends a node's Variables in the payload; the server's own environment
// holds secrets (DENO_AUTH_TOKENS) that no script may read.
for (
  const [isolation, execute] of [
    ["worker", executeInWorker],
    ["process", executeInProcess],
  ] as const
) {
  Deno.test(`${isolation} isolation - refuses to read the environment`, async () => {
    Deno.env.set("PIPER_TEST_SECRET", "secret");
    const script = `
      export function run() {
        return Deno.env.get("PIPER_TEST_SECRET");
      }
    `;

    try {
      await assertRejects(
        () => execute({ script, fn: "run", payload: {} }),
        Error,
        "env access",
      );
    } finally {
      Deno.env.delete("PIPER_TEST_SECRET");
    }
  });
}

// The environment is also a file on Linux. A worker shares the server's
// process, so only process isolation can deny it.
Deno.test("process isolation - refuses to read the environment from /proc", async () => {
  const script = `
    export function run() {
      return Deno.readTextFileSync("/proc/self/environ");
    }
  `;

  await assertRejects(
    () => executeInProcess({ script, fn: "run", payload: {} }),
    Error,
    "read access",
  );
});
