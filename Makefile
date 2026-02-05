.PHONY: dev dev-fallback app watcher install test test-e2e test-e2e-ui lint format nats nats-stop

# Development - starts watcher + app, Ctrl+C kills both
dev:
	@trap 'kill 0' EXIT; \
	cd inaturalist-watcher && bun run dev & \
	cd wildlive && bun run dev

# Development with fallback data (no iNaturalist API needed)
dev-fallback:
	@trap 'kill 0' EXIT; \
	cd inaturalist-watcher && bun run dev:fallback & \
	cd wildlive && bun run dev

# Start app only
app:
	cd wildlive && bun run dev

# Start watcher only
watcher:
	cd inaturalist-watcher && bun run dev

install:
	cd inaturalist-watcher && bun install
	cd wildlive && bun install

test:
	cd wildlive && bun test tests/unit

test-e2e:
	cd wildlive && ./node_modules/.bin/playwright test

test-e2e-ui:
	cd wildlive && ./node_modules/.bin/playwright test --ui

lint:
	cd wildlive && bun run lint

format:
	cd wildlive && bun run format

# Start NATS server in background
nats:
	docker compose -f nats/docker-compose.yml up -d

# Stop NATS
nats-stop:
	docker compose -f nats/docker-compose.yml down
