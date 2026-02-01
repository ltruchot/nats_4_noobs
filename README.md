# Wildlive

Interactive 3D globe with real-time SSE streaming.

**Demo:** https://wildlive.onrender.com/

## Stack

- **Runtime**: Bun
- **Framework**: Hono
- **Frontend**: Datastar + Rocket (Web Components)
- **3D**: Globe.gl / Three.js

## Development

```bash
make install
make dev
```

## Tests

```bash
make test        # Unit tests
make test-e2e    # E2E Playwright
make lint        # Biome
```

## Deployment

Render.com with `render.yaml`.
