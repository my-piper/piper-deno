/**
 * Prometheus metrics, recorded through the OpenTelemetry metrics SDK and
 * exposed for scraping on a dedicated listener (ADR 0003).
 */
import { type Attributes, ValueType } from "@opentelemetry/api";
import {
  PrometheusExporter,
  PrometheusSerializer,
} from "@opentelemetry/exporter-prometheus";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { MeterProvider } from "@opentelemetry/sdk-metrics";
import { ExecutionError } from "./execution/common.ts";

export type Isolation = "process" | "worker";

export type Outcome =
  | "success"
  | "script_error"
  | "timeout"
  | "memory_limit"
  | "invalid_request"
  | "internal_error";

export type RecycleReason = "max_requests" | "timeout" | "error";

const SERVICE_NAME = "piper-deno";
const EVENT_LOOP_PROBE_INTERVAL_MS = 500;

// Runs may last from milliseconds up to the 300 s timeout cap
const RUN_DURATION_BUCKETS_S = [
  0.01,
  0.025,
  0.05,
  0.1,
  0.25,
  0.5,
  1,
  2.5,
  5,
  10,
  30,
  60,
  120,
  300,
];

// Pull-based reader: the SDK aggregates, the listener below serializes on scrape
const reader = new PrometheusExporter({ preventServerStart: true });
const serializer = new PrometheusSerializer();

const meter = new MeterProvider({
  resource: resourceFromAttributes({ "service.name": SERVICE_NAME }),
  readers: [reader],
}).getMeter(SERVICE_NAME);

const runs = meter.createCounter("deno_runs", {
  description: "Runs finished, by isolation mode and outcome",
  valueType: ValueType.INT,
});

const runDuration = meter.createHistogram("deno_run_duration_seconds", {
  description: "Wall-clock duration of a run",
  unit: "s",
  advice: { explicitBucketBoundaries: RUN_DURATION_BUCKETS_S },
});

const runsInFlight = meter.createUpDownCounter("deno_runs_in_flight", {
  description: "Runs currently executing",
  valueType: ValueType.INT,
});

const temporaryWorkers = meter.createCounter("deno_worker_temporary", {
  description: "Workers created outside the pool because it was saturated",
  valueType: ValueType.INT,
});

const recycledWorkers = meter.createCounter("deno_worker_recycled", {
  description: "Pooled workers terminated and removed from the pool",
  valueType: ValueType.INT,
});

const workerPoolWorkers = meter.createObservableGauge(
  "deno_worker_pool_workers",
  {
    description: "Pooled workers, by state",
    valueType: ValueType.INT,
  },
);

const memoryRss = meter.createObservableGauge("deno_memory_rss_bytes", {
  description: "Resident set size of the service process",
  unit: "By",
  valueType: ValueType.INT,
});

const memoryHeapUsed = meter.createObservableGauge(
  "deno_memory_heap_used_bytes",
  {
    description: "V8 heap used by the service process",
    unit: "By",
    valueType: ValueType.INT,
  },
);

const memoryHeapTotal = meter.createObservableGauge(
  "deno_memory_heap_total_bytes",
  {
    description: "V8 heap allocated by the service process",
    unit: "By",
    valueType: ValueType.INT,
  },
);

const eventLoopLag = meter.createObservableGauge(
  "deno_event_loop_lag_seconds",
  {
    description: "Delay of the latest event-loop probe beyond its schedule",
    unit: "s",
  },
);

memoryRss.addCallback((result) => {
  result.observe(Deno.memoryUsage().rss);
});
memoryHeapUsed.addCallback((result) => {
  result.observe(Deno.memoryUsage().heapUsed);
});
memoryHeapTotal.addCallback((result) => {
  result.observe(Deno.memoryUsage().heapTotal);
});

export function classifyError(error: unknown): Outcome {
  if (!(error instanceof ExecutionError)) {
    return "internal_error";
  }
  switch (error.code) {
    case "TIMEOUT_ERROR":
      return "timeout";
    case "MEMORY_LIMIT_ERROR":
      return "memory_limit";
    default:
      return "script_error";
  }
}

/**
 * Runs `run` and records its count, duration, outcome and in-flight state.
 * Errors are rethrown unchanged.
 */
export async function measureRun<T>(
  isolation: Isolation,
  run: () => Promise<T>,
): Promise<T> {
  const attributes: Attributes = { isolation };
  const startedAt = performance.now();
  runsInFlight.add(1, attributes);
  let outcome: Outcome = "success";
  try {
    return await run();
  } catch (e) {
    outcome = classifyError(e);
    throw e;
  } finally {
    runsInFlight.add(-1, attributes);
    const outcomeAttributes = { isolation, outcome };
    runs.add(1, outcomeAttributes);
    runDuration.record(
      (performance.now() - startedAt) / 1000,
      outcomeAttributes,
    );
  }
}

/** Counts a request rejected before its isolation mode was known. */
export function recordInvalidRequest(): void {
  runs.add(1, { isolation: "unknown", outcome: "invalid_request" });
}

export function recordTemporaryWorker(): void {
  temporaryWorkers.add(1);
}

export function recordRecycledWorker(reason: RecycleReason): void {
  recycledWorkers.add(1, { reason });
}

/** Registers the source of the worker pool gauge; called once by its owner. */
export function observeWorkerPool(
  snapshot: () => { busy: number; idle: number },
): void {
  workerPoolWorkers.addCallback((result) => {
    const { busy, idle } = snapshot();
    result.observe(busy, { state: "busy" });
    result.observe(idle, { state: "idle" });
  });
}

/** Current metrics in the Prometheus text exposition format. */
export async function scrape(): Promise<string> {
  const { resourceMetrics } = await reader.collect();
  return serializer.serialize(resourceMetrics);
}

function startEventLoopProbe(): void {
  let lagSeconds = 0;
  let expectedAt = performance.now() + EVENT_LOOP_PROBE_INTERVAL_MS;
  const timer = setInterval(() => {
    const now = performance.now();
    lagSeconds = Math.max(0, now - expectedAt) / 1000;
    expectedAt = now + EVENT_LOOP_PROBE_INTERVAL_MS;
  }, EVENT_LOOP_PROBE_INTERVAL_MS);
  // The probe must not keep the process alive on its own
  Deno.unrefTimer(timer);
  eventLoopLag.addCallback((result) => {
    result.observe(lagSeconds);
  });
}

/**
 * Serves `GET /metrics` on `port`, apart from the run endpoint, and starts
 * the event-loop probe.
 */
export function startMetricsServer(port: number): Deno.HttpServer {
  startEventLoopProbe();
  return Deno.serve(
    {
      hostname: "0.0.0.0",
      port,
      onListen: ({ port }) => console.log(`📈 Metrics on :${port}/metrics`),
    },
    async (req: Request): Promise<Response> => {
      const { pathname } = new URL(req.url);
      if (req.method !== "GET" || pathname !== "/metrics") {
        return new Response("Not found", { status: 404 });
      }
      return new Response(await scrape(), {
        headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
      });
    },
  );
}
