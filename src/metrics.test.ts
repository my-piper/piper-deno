import { assert, assertEquals, assertRejects } from "@std/assert";
import { ExecutionError } from "./execution/common.ts";
import { execute as executeInProcess } from "./execution/process/executor.ts";
import { execute as executeInWorker } from "./execution/worker/executor.ts";
import {
  classifyError,
  type Isolation,
  measureRun,
  scrape,
} from "./metrics.ts";
import type { RunCode } from "./run-code.ts";

const EXECUTORS: Record<Isolation, (runCode: RunCode) => Promise<unknown>> = {
  process: executeInProcess,
  worker: executeInWorker,
};

// Value of the series `name` whose labels include `labels`; 0 if absent
function seriesValue(
  text: string,
  name: string,
  labels: Record<string, string>,
): number {
  const wanted = Object.entries(labels).map(([k, v]) => `${k}="${v}"`);
  const line = text.split("\n").find((l) =>
    l.startsWith(`${name}{`) && wanted.every((w) => l.includes(w))
  );
  return line ? Number(line.slice(line.lastIndexOf(" ") + 1)) : 0;
}

async function runsCount(
  isolation: Isolation,
  outcome: string,
): Promise<number> {
  return seriesValue(await scrape(), "deno_runs_total", { isolation, outcome });
}

const CASES = [
  {
    outcome: "success",
    script: "export function run() { return 1; }",
    timeout: undefined,
  },
  {
    outcome: "script_error",
    script: "export function run() { throw new Error('boom'); }",
    timeout: undefined,
  },
  {
    outcome: "timeout",
    script: "export function run() { while (true) {} }",
    timeout: 1000,
  },
];

for (const isolation of ["process", "worker"] as const) {
  for (const { outcome, script, timeout } of CASES) {
    Deno.test({
      name: `metrics - ${isolation} run counted as ${outcome}`,
      async fn() {
        // Arrange
        const before = await runsCount(isolation, outcome);
        const run = (): Promise<unknown> =>
          EXECUTORS[isolation]({ script, fn: "run", payload: {}, timeout });

        // Act
        if (outcome === "success") {
          await measureRun(isolation, run);
        } else {
          await assertRejects(() => measureRun(isolation, run));
        }

        // Assert
        const text = await scrape();
        assertEquals(
          seriesValue(text, "deno_runs_total", { isolation, outcome }),
          before + 1,
        );
        assert(
          seriesValue(text, "deno_run_duration_seconds_count", {
            isolation,
            outcome,
          }) >= 1,
        );
        assertEquals(
          seriesValue(text, "deno_runs_in_flight", { isolation }),
          0,
        );
      },
      sanitizeResources: false,
      sanitizeOps: false,
    });
  }
}

Deno.test({
  name: "metrics - worker timeout is an ExecutionError with TIMEOUT_ERROR",
  async fn() {
    // Act
    const error = await assertRejects(
      () =>
        executeInWorker({
          script: "export function run() { while (true) {} }",
          fn: "run",
          payload: {},
          timeout: 1000,
        }),
      ExecutionError,
    );

    // Assert
    assertEquals(error.code, "TIMEOUT_ERROR");
    assert(
      seriesValue(await scrape(), "deno_worker_recycled_total", {
        reason: "timeout",
      }) >= 1,
    );
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test("metrics - classifyError maps error codes to outcomes", () => {
  assertEquals(
    classifyError(new ExecutionError({ code: "TIMEOUT_ERROR" })),
    "timeout",
  );
  assertEquals(
    classifyError(new ExecutionError({ code: "MEMORY_LIMIT_ERROR" })),
    "memory_limit",
  );
  assertEquals(classifyError(new ExecutionError({})), "script_error");
  assertEquals(classifyError(new Error("internal")), "internal_error");
});

Deno.test("metrics - scrape exposes target_info and runtime gauges", async () => {
  // Act
  const text = await scrape();

  // Assert
  assert(text.includes('target_info{service_name="piper-deno"} 1'));
  assert(text.includes("deno_memory_rss_bytes"));
  assert(text.includes("deno_memory_heap_used_bytes"));
  assert(text.includes('deno_worker_pool_workers{state="idle"'));
});
