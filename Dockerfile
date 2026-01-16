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

# Expose port
EXPOSE 80

# Run the server
CMD ["deno", "run", "--allow-net", "--allow-read", "--allow-env", "server.ts"]

