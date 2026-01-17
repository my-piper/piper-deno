# Use official Deno image (latest stable)
FROM denoland/deno:latest

# Set working directory
WORKDIR /app

# Copy dependency files first for better caching
COPY deno.json ./

# Copy source code
COPY . .

# Cache dependencies
RUN deno cache server.ts

# Set default port to 80
ENV PORT=80

# Set default per-worker memory limit (in MB)
ENV PER_WORKER_MEMORY_MB=128

# Expose port
EXPOSE 80

# Run the server
# --allow-run is needed for process-based isolation (executor-isolated.ts)
# Memory limits are enforced per-process in executor-isolated.ts (configurable via PER_WORKER_MEMORY_MB)
CMD ["deno", "run", "--allow-net", "--allow-read", "--allow-env", "--allow-run", "server.ts"]

