import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const BASE_URL = "http://127.0.0.1:3333";

// Helper function to make requests
async function postCode(
  script: string,
  fn: string,
  payload: Record<string, unknown>
) {
  const response = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ script, fn, payload }),
  });
  return response;
}

Deno.test({
  name: "server - normal code execution",
  async fn() {
    const script = `
      export function run(inputs) {
        console.log("Processing request");
        return { result: "success", input: inputs.value };
      }
    `;

    const response = await postCode(script, "run", { value: 42 });
    assertEquals(response.status, 200);

    const data = await response.json();
    assertEquals(data.result, { result: "success", input: 42 });
    assertEquals(data.logs.length, 1);
    assertEquals(data.logs[0].message, "Processing request");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "server - infinite loop returns timeout error",
  async fn() {
    const script = `
      export function run(inputs) {
        while(true) {}
        return inputs;
      }
    `;

    const response = await postCode(script, "run", { value: 42 });
    assertEquals(response.status, 400);

    const data = await response.json();
    assertEquals(data.error, "Execution timeout");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "server - invalid request method",
  async fn() {
    const response = await fetch(BASE_URL, {
      method: "GET",
    });
    assertEquals(response.status, 405);

    const text = await response.text();
    assertEquals(text, "Only POST");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "server - invalid request body",
  async fn() {
    const response = await fetch(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invalid: "data" }),
    });
    assertEquals(response.status, 400);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "server - missing function in code",
  async fn() {
    const script = `
      export function wrongName(inputs) {
        return { result: "success" };
      }
    `;

    const response = await postCode(script, "run", { value: 42 });
    assertEquals(response.status, 400);

    const data = await response.json();
    assertEquals(data.error, "Code must export function run");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "server - code with syntax error",
  async fn() {
    const script = `
      export function run(inputs) {
        return { result: "success"  // Missing closing brace
      }
    `;

    const response = await postCode(script, "run", { value: 42 });
    assertEquals(response.status, 400);

    const data = await response.json();
    assertEquals(typeof data.error, "string");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "server - code with runtime error",
  async fn() {
    const script = `
      export function run(inputs) {
        throw new Error("Runtime error");
      }
    `;

    const response = await postCode(script, "run", { value: 42 });
    assertEquals(response.status, 400);

    const data = await response.json();
    assertEquals(data.error, "Runtime error");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "server - async code execution",
  async fn() {
    const script = `
      export async function run(inputs) {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { result: "async success" };
      }
    `;

    const response = await postCode(script, "run", { value: 42 });
    assertEquals(response.status, 200);

    const data = await response.json();
    assertEquals(data.result, { result: "async success" });
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "server - concurrent requests isolation",
  async fn() {
    const normalCode = `
      export function run(inputs) {
        return { user: inputs.user, result: "success" };
      }
    `;

    const hackerCode = `
      export function run(inputs) {
        while(true) {}
        return inputs;
      }
    `;

    // Execute 3 concurrent requests
    const [response1, response2, response3] = await Promise.all([
      postCode(normalCode, "run", { user: 1 }),
      postCode(hackerCode, "run", { user: "hacker" }),
      postCode(normalCode, "run", { user: 2 }),
    ]);

    // Normal requests should succeed
    assertEquals(response1.status, 200);
    assertEquals(response3.status, 200);

    // Hacker request should timeout
    assertEquals(response2.status, 400);

    const data1 = await response1.json();
    const data2 = await response2.json();
    const data3 = await response3.json();

    assertEquals(data1.result, { user: 1, result: "success" });
    assertEquals(data2.error, "Execution timeout");
    assertEquals(data3.result, { user: 2, result: "success" });
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "server - custom timeout parameter",
  async fn() {
    const script = `
      export async function run(inputs) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return { result: "completed" };
      }
    `;

    // Should timeout with 1 second timeout
    const response1 = await fetch(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        script,
        fn: "run",
        payload: {},
        timeout: 1000,
      }),
    });
    assertEquals(response1.status, 400);
    const data1 = await response1.json();
    assertEquals(data1.error, "Execution timeout");

    // Should succeed with 3 second timeout
    const response2 = await fetch(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        script,
        fn: "run",
        payload: {},
        timeout: 3000,
      }),
    });
    assertEquals(response2.status, 200);
    const data2 = await response2.json();
    assertEquals(data2.result, { result: "completed" });
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "server - timeout defaults to 5 seconds",
  async fn() {
    const script = `
      export async function run(inputs) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return { result: "completed in 2s" };
      }
    `;

    // Should succeed because default is 5s
    const response = await postCode(script, "run", {});
    assertEquals(response.status, 200);

    const data = await response.json();
    assertEquals(data.result, { result: "completed in 2s" });
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "server - timeout max is 300 seconds",
  async fn() {
    const script = `
      export function run(inputs) {
        return { result: "quick" };
      }
    `;

    // Request 400 seconds, should be capped at 300 seconds
    const response = await fetch(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        script,
        fn: "run",
        payload: {},
        timeout: 400000, // 400 seconds
      }),
    });
    assertEquals(response.status, 200);

    const data = await response.json();
    assertEquals(data.result, { result: "quick" });
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
