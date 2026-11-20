# Thin wrapper over `deno task` — deno.json is the single source of truth
# for commands and permission flags.

DENO ?= deno
DOCKER ?= docker
IMAGE ?= piper-deno:local
PORT ?= 3333
PER_WORKER_MEMORY_MB ?= 128

.DEFAULT_GOAL := help

.PHONY: help install run test test-unit test-concurrent test-e2e \
	fmt fmt-check lint lint-fix typecheck check ci \
	docker-build docker-run clean require-deno

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

require-deno:
	@command -v $(DENO) >/dev/null 2>&1 || { \
		echo "deno not found. Install it: brew install deno  (or see https://docs.deno.com/runtime/getting_started/installation/)" >&2; \
		exit 1; }

install: require-deno ## Cache dependencies against deno.lock
	$(DENO) task install

run: require-deno ## Start the server locally
	$(DENO) task start

test: require-deno ## Run the full test suite
	$(DENO) task test

test-unit: require-deno ## Run unit tests (executor + buffer encoding)
	$(DENO) task test:unit

test-concurrent: require-deno ## Run concurrency/isolation tests
	$(DENO) task test:concurrent

test-e2e: require-deno ## Run HTTP end-to-end tests (needs `make run` in another shell)
	$(DENO) task test:e2e

fmt: require-deno ## Format code
	$(DENO) task fmt

fmt-check: require-deno ## Check formatting
	$(DENO) task fmt:check

lint: require-deno ## Lint code
	$(DENO) task lint

lint-fix: require-deno ## Lint and auto-fix
	$(DENO) task lint:fix

typecheck: require-deno ## Type-check entry points
	$(DENO) task check:types

check: require-deno ## Format check + lint + type check (pre-push gate)
	$(DENO) task check

ci: check test ## Run everything CI should run

docker-build: ## Build the Docker image (IMAGE=...)
	$(DOCKER) build -t $(IMAGE) .

docker-run: ## Run the Docker image on localhost:PORT (default 3333)
	$(DOCKER) run --rm -p $(PORT):80 \
		-e PER_WORKER_MEMORY_MB=$(PER_WORKER_MEMORY_MB) $(IMAGE)

clean: ## Remove local build/test artifacts
	rm -rf coverage .deno
