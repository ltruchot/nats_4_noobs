# Wildlive

Globe 3D interactif avec SSE temps réel.

## Stack

- **Runtime**: Bun
- **Framework**: Hono
- **Frontend**: Datastar + Rocket (Web Components)
- **3D**: Globe.gl / Three.js

## Développement

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

## Déploiement

Render.com avec `render.yaml`.
