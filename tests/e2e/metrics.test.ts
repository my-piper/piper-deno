import { assert, assertEquals } from "@std/assert";

const BASE_URL = "http://127.0.0.1:3333";
const METRICS_URL = "http://127.0.0.1:9464/metrics";

Deno.test({
  name: "metrics - /metrics serves run metrics after a run",
  async fn() {
    // Arrange
    const run = await fetch(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        script: "export function run() { return 1; }",
        fn: "run",
        payload: {},
      }),
    });
    await run.body?.cancel();

    // Act
    const response = await fetch(METRICS_URL);
    const text = await response.text();

    // Assert
    assertEquals(response.status, 200);
    assert(text.includes('target_info{service_name="piper-deno"} 1'));
    assert(
      text.includes(
        'deno_runs_total{isolation="process",outcome="success"',
      ),
    );
    assert(text.includes("deno_run_duration_seconds_bucket"));
    assert(text.includes("deno_memory_rss_bytes"));
    assert(text.includes("deno_event_loop_lag_seconds"));
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "metrics - main port does not serve /metrics",
  async fn() {
    // Act
    const response = await fetch(`${BASE_URL}/metrics`);
    const text = await response.text();

    // Assert
    assertEquals(response.status, 405);
    assertEquals(text, "Only POST");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "metrics - worker timeout returns 422 TIMEOUT_ERROR",
  async fn() {
    // Act
    const response = await fetch(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        script: "export function run() { while (true) {} }",
        fn: "run",
        payload: {},
        timeout: 1000,
        isolation: "none",
      }),
    });
    const data = await response.json();

    // Assert
    assertEquals(response.status, 422);
    assertEquals(data.code, "TIMEOUT_ERROR");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
