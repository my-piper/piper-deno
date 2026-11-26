# Metrics through the OpenTelemetry SDK with a Prometheus pull exporter

The service needs metrics for runs, the worker pool and the runtime, stored in
the VictoriaMetrics instance that vmagent fills by scraping. Record them with
the OpenTelemetry metrics SDK (`@opentelemetry/sdk-metrics`) and expose them
with `@opentelemetry/exporter-prometheus`, serialized on scrape by a `Deno.serve`
listener on `METRICS_PORT`. This is the pattern Piper's other OpenTelemetry
services already use, so their `target_info` and scrape setup apply unchanged.

We did not use `prom-client`, which the Piper backend uses for its BullMQ
metrics: it ties instrumentation to Prometheus, while the OpenTelemetry API
lets traces or OTLP export be added later by changing the exporter, without
re-instrumenting. We did not use Deno's built-in OpenTelemetry (`OTEL_DENO`):
it only pushes OTLP, so it needs a collector endpoint and credentials in every
deployment and differs from how the other services are scraped.

Metrics are served on a separate port, not the run port, because the run port
executes caller-supplied code and keeps answering every non-POST request with
405. Labels never identify the script, so the number of series stays bounded.
Runtime gauges are read from `Deno.memoryUsage()` and a timer-drift probe:
the exporter has no default runtime metrics, and the Node host-metrics package
depends on libraries not verified under Deno.
