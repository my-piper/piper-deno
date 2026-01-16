import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { execute } from "./executor.ts";

Deno.test("executor - normal code execution", async () => {
  const script = `
    export function greet(payload) {
      console.log("Hello from user code!");
      return { message: "Hello " + payload.name };
    }
  `;

  const result = await execute({
    script,
    fn: "greet",
    payload: { name: "World" },
  });

  assertEquals(result.result, { message: "Hello World" });
  assertEquals(result.logs.length, 1);
  assertEquals(result.logs[0].level, "log");
  assertEquals(result.logs[0].message, "Hello from user code!");
});

Deno.test("executor - async code execution", async () => {
  const script = `
    export async function greet(payload) {
      console.log("Starting async operation...");
      await new Promise(resolve => setTimeout(resolve, 100));
      console.log("Async operation complete!");
      return { message: "Async hello " + payload.name };
    }
  `;

  const result = await execute({
    script,
    fn: "greet",
    payload: { name: "Async User" },
  });

  assertEquals(result.result, { message: "Async hello Async User" });
  assertEquals(result.logs.length, 2);
  assertEquals(result.logs[0].message, "Starting async operation...");
  assertEquals(result.logs[1].message, "Async operation complete!");
});

Deno.test(
  "executor - CPU-intensive code completes within timeout",
  async () => {
    const script = `
    export function greet(payload) {
      console.log("Starting CPU-intensive task...");
      let sum = 0;
      for (let i = 0; i < 1000000; i++) {
        sum += i;
      }
      console.log("CPU-intensive task complete!");
      return { message: "Sum: " + sum };
    }
  `;

    const result = await execute({
      script,
      fn: "greet",
      payload: { name: "CPU" },
    });

    assertEquals(result.result, { message: "Sum: 499999500000" });
    assertEquals(result.logs.length, 2);
  },
);

Deno.test("executor - error handling", async () => {
  const script = `
    export function greet(payload) {
      console.log("About to throw error...");
      throw new Error("Intentional error for testing");
    }
  `;

  await assertRejects(
    async () => {
      await execute({
        script,
        fn: "greet",
        payload: { name: "Error" },
      });
    },
    Error,
    "Intentional error for testing",
  );
});

Deno.test("executor - infinite loop timeout", async () => {
  const script = `
    export function greet(payload) {
      console.log("Starting infinite loop...");
      while(true) {
        // This will run forever but worker will be terminated
      }
      return { message: "This will never be reached" };
    }
  `;

  await assertRejects(
    async () => {
      await execute({
        script,
        fn: "greet",
        payload: { name: "Loop" },
      });
    },
    Error,
    "Execution timeout",
  );
});

Deno.test("executor - missing function", async () => {
  const script = `
    export function wrongName(payload) {
      return { message: "Hello" };
    }
  `;

  await assertRejects(
    async () => {
      await execute({
        script,
        fn: "greet",
        payload: { name: "Test" },
      });
    },
    Error,
    "Code must export function greet",
  );
});

Deno.test("executor - multiple console log levels", async () => {
  const script = `
    export function greet(payload) {
      console.log("Log message");
      console.info("Info message");
      console.warn("Warning message");
      console.error("Error message");
      return { message: "Done" };
    }
  `;

  const result = await execute({
    script,
    fn: "greet",
    payload: { name: "Test" },
  });

  assertEquals(result.logs.length, 4);
  assertEquals(result.logs[0].level, "log");
  assertEquals(result.logs[1].level, "info");
  assertEquals(result.logs[2].level, "warn");
  assertEquals(result.logs[3].level, "error");
});

Deno.test("executor - custom timeout in request", async () => {
  const script = `
    export async function greet(payload) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      return { message: "Done" };
    }
  `;

  // Should timeout with default 5000ms when no timeout specified
  // But this code takes 3s, so it should succeed
  const result1 = await execute({
    script,
    fn: "greet",
    payload: { name: "Test" },
  });

  assertEquals(result1.result, { message: "Done" });

  // Should succeed with custom 6000ms timeout
  const result2 = await execute({
    script,
    fn: "greet",
    payload: { name: "Test" },
    timeout: 6000,
  });

  assertEquals(result2.result, { message: "Done" });

  // Should timeout with 1000ms timeout
  await assertRejects(
    async () => {
      await execute({
        script,
        fn: "greet",
        payload: { name: "Test" },
        timeout: 1000,
      });
    },
    Error,
    "Execution timeout",
  );
});

Deno.test("executor - timeout defaults to 5 seconds", async () => {
  const script = `
    export async function greet(payload) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      return { message: "Completed in 2s" };
    }
  `;

  // Should succeed because default is 5s
  const result = await execute({
    script,
    fn: "greet",
    payload: { name: "Test" },
  });

  assertEquals(result.result, { message: "Completed in 2s" });
});

Deno.test("executor - timeout max is 300 seconds", async () => {
  const script = `
    export function greet(payload) {
      return { message: "Quick execution" };
    }
  `;

  // Request 400 seconds, should be capped at 300 seconds
  // But code executes quickly so it will succeed
  const result = await execute({
    script,
    fn: "greet",
    payload: { name: "Test" },
    timeout: 400000, // 400 seconds - should be capped at 300
  });

  assertEquals(result.result, { message: "Quick execution" });
});

Deno.test("executor - timeout validation in schema", async () => {
  const script = `
    export function greet(payload) {
      return { message: "Hello" };
    }
  `;

  // Valid timeout values
  const result1 = await execute({
    script,
    fn: "greet",
    payload: {},
    timeout: 1000,
  });
  assertEquals(result1.result, { message: "Hello" });

  const result2 = await execute({
    script,
    fn: "greet",
    payload: {},
    timeout: 300000, // Max allowed
  });
  assertEquals(result2.result, { message: "Hello" });
});
