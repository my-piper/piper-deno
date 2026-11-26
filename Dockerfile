# Pinned Deno version: the single source of truth. CI reads it from this line
# and Dependabot bumps it.
FROM denoland/deno:2.9.8

WORKDIR /app

# Dependency manifests first for better layer caching
COPY deno.json deno.lock ./

# Runtime source only (tests are excluded via .dockerignore)
COPY src/ ./src/

# Install native npm binaries for the target architecture before caching.
RUN deno install --frozen

# Cache dependencies for every entry point: the server and the two
# isolation runtimes it spawns (Web Worker and child process)
RUN deno cache --frozen src/server.ts src/execution/worker/worker.ts src/execution/process/child.ts

# Set default port to 80
ENV PORT=80

# Set default per-worker memory limit (in MB)
ENV PER_WORKER_MEMORY_MB=128

# Prometheus metrics listener (GET /metrics); unset METRICS_PORT to disable
ENV METRICS_PORT=9464

EXPOSE 80
EXPOSE 9464

# Permission flags live in deno.json ("start" task) so local runs and the
# image cannot drift. --allow-run is needed for Process isolation;
# per-process memory limits are set in src/execution/process/executor.ts.
CMD ["deno", "task", "start"]
