.PHONY: dev install test test-e2e test-e2e-ui lint format

dev:
	cd wildlive && bun run dev

install:
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
