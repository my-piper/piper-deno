import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { execute } from "./executor.ts";

Deno.test("concurrent execution - isolation test", async () => {
  const normalCode1 = `
    export function run(inputs) {
      console.log("Normal user 1");
      return { user: 1, result: "success" };
    }
  `;

  const hackerCode = `
    export function run(inputs) {
      console.log("Hacker attack!");
      while(true) {
        // Infinite loop attack
      }
      return inputs;
    }
  `;

  const normalCode2 = `
    export function run(inputs) {
      console.log("Normal user 2");
      return { user: 2, result: "success" };
    }
  `;

  // Execute all 3 requests concurrently
  const startTime = Date.now();
  const results = await Promise.allSettled([
    execute({ code: normalCode1, fn: "run", payload: { user: 1 } }),
    execute({ code: hackerCode, fn: "run", payload: { user: "hacker" } }),
    execute({ code: normalCode2, fn: "run", payload: { user: 2 } }),
  ]);
  const duration = Date.now() - startTime;

  // Verify results
  assertEquals(results[0].status, "fulfilled");
  assertEquals(results[1].status, "rejected");
  assertEquals(results[2].status, "fulfilled");

  // Check normal user 1 succeeded
  if (results[0].status === "fulfilled") {
    assertEquals(results[0].value.result, { user: 1, result: "success" });
    assertEquals(results[0].value.logs.length, 1);
    assertEquals(results[0].value.logs[0].message, "Normal user 1");
  }

  // Check hacker was blocked
  if (results[1].status === "rejected") {
    assertEquals(results[1].reason.message, "Execution timeout");
  }

  // Check normal user 2 succeeded
  if (results[2].status === "fulfilled") {
    assertEquals(results[2].value.result, { user: 2, result: "success" });
    assertEquals(results[2].value.logs.length, 1);
    assertEquals(results[2].value.logs[0].message, "Normal user 2");
  }

  // Verify it completed in approximately 5 seconds (default timeout duration)
  // Allow some margin for execution overhead
  assertEquals(
    duration >= 5000,
    true,
    "Should take at least 5 seconds (default timeout)"
  );
  assertEquals(duration < 6000, true, "Should complete shortly after timeout");

  console.log(`✅ Concurrent execution test passed in ${duration}ms`);
  console.log("  • Normal user 1: Success");
  console.log("  • Hacker: Timeout (isolated)");
  console.log("  • Normal user 2: Success");
});

Deno.test("concurrent execution - multiple normal requests", async () => {
  const code = `
    export async function run(inputs) {
      console.log("Processing request " + inputs.id);
      await new Promise(resolve => setTimeout(resolve, 100));
      return { id: inputs.id, result: "success" };
    }
  `;

  // Execute 5 concurrent requests
  const startTime = Date.now();
  const results = await Promise.all([
    execute({ code, fn: "run", payload: { id: 1 } }),
    execute({ code, fn: "run", payload: { id: 2 } }),
    execute({ code, fn: "run", payload: { id: 3 } }),
    execute({ code, fn: "run", payload: { id: 4 } }),
    execute({ code, fn: "run", payload: { id: 5 } }),
  ]);
  const duration = Date.now() - startTime;

  // All should succeed
  assertEquals(results.length, 5);
  results.forEach((result, index) => {
    assertEquals(result.result, { id: index + 1, result: "success" });
  });

  // Should complete in parallel (not 5 * 100ms = 500ms)
  // Should be closer to 100ms + overhead
  assertEquals(
    duration < 300,
    true,
    `Should complete in parallel, took ${duration}ms`
  );

  console.log(`✅ Multiple concurrent requests completed in ${duration}ms`);
});

Deno.test("concurrent execution - mixed fast and slow requests", async () => {
  const fastCode = `
    export function run(inputs) {
      return { type: "fast", result: "done" };
    }
  `;

  const slowCode = `
    export async function run(inputs) {
      await new Promise(resolve => setTimeout(resolve, 500));
      return { type: "slow", result: "done" };
    }
  `;

  const startTime = Date.now();
  const results = await Promise.allSettled([
    execute({ code: fastCode, fn: "run", payload: {} }),
    execute({ code: slowCode, fn: "run", payload: {} }),
    execute({ code: fastCode, fn: "run", payload: {} }),
  ]);
  const duration = Date.now() - startTime;

  // All should succeed
  assertEquals(results[0].status, "fulfilled");
  assertEquals(results[1].status, "fulfilled");
  assertEquals(results[2].status, "fulfilled");

  // Fast requests should complete quickly
  if (results[0].status === "fulfilled") {
    assertEquals(results[0].value.result, { type: "fast", result: "done" });
  }

  // Slow request should also complete
  if (results[1].status === "fulfilled") {
    assertEquals(results[1].value.result, { type: "slow", result: "done" });
  }

  // Duration should be dominated by the slow request (~500ms)
  assertEquals(duration >= 500, true, "Should wait for slow request");
  assertEquals(
    duration < 800,
    true,
    "Should not be much slower than slow request"
  );

  console.log(`✅ Mixed speed requests completed in ${duration}ms`);
});
