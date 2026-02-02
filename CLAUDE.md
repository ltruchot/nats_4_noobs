# NATS 4 Noobs

A hands-on NATS training repository. Learn NATS messaging patterns progressively through a real-time wildlife observation globe.

## What is NATS?

NATS is a **single binary** (`nats-server`) that acts as a message router. That's it.

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│  Publisher  │──────▶│ NATS Server │◀──────│ Subscriber  │
│  (your app) │       │  (binary)   │       │ (other app) │
└─────────────┘       └─────────────┘       └─────────────┘
```

- **Not a database** (unless you enable JetStream)
- **Not a framework**
- Just an ultra-fast message router

## Repository Structure

- **main branch**: Final state with all NATS features
- **lvlX branches**: Each level builds on the previous

## Data Source

**iNaturalist Europe API** - Real-time wildlife observations (~2-6 obs/minute)

```bash
curl "https://api.inaturalist.org/v1/observations?place_id=97391&per_page=30&order=desc&photos=true"
```

Useful place IDs: Europe=97391, France=6753, UK=6857, Germany=7207

## Training Levels

| Level | Concept | Frontend Interaction | What You Learn |
|-------|---------|---------------------|----------------|
| **lvl0** | Baseline | Globe + SSE streaming US cities | Working app, no NATS yet |
| **lvl1** | Pub/Sub basics | iNaturalist points on globe | First NATS connection |
| **lvl2** | Subjects | Points colored by taxon | Message routing |
| **lvl3** | Wildcards + filters | Toggle buttons per taxon | Dynamic subscribe/unsubscribe |
| **lvl4** | Request/Reply | Click point → species details | Request/response pattern |
| **lvl5** | Auth zero-trust | Role switcher (observer/dashboard/admin) | NKeys, permissions |
| **lvl6** | JetStream Stream | Replay button + pause/resume | Persistence, history |
| **lvl7** | JetStream KV | Live counters per taxon | Shared state |

## Level Details

### lvl3 - Subscription Filters (most interactive)

```
┌─────────────────────────────────────────────────────┐
│  [🐦 Birds]  [🦋 Insects]  [🐿 Mammals]  [🌱 Plants] │
│     ON          OFF           ON           OFF      │
├─────────────────────────────────────────────────────┤
│              🌍 Globe                               │
│        (only birds + mammals visible)              │
└─────────────────────────────────────────────────────┘
```

- Click "Insects OFF → ON" = `nc.subscribe('nature.Insecta')`
- Click "Birds ON → OFF" = `sub.unsubscribe()`

### lvl4 - Request/Reply (click interaction)

```
┌─────────────────────────────────────────────────────┐
│              🌍 Globe                               │
│                  📍 ← click                         │
├─────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────┐               │
│  │ 📷 [Photo]                      │               │
│  │ European Robin                  │               │
│  │ Erithacus rubecula              │               │
│  │ 📍 Rennes, France               │               │
│  │ 👤 naturalist42                 │               │
│  └─────────────────────────────────┘               │
└─────────────────────────────────────────────────────┘
```

- Click → `nc.request('species.details', id)` → response with enriched data

### lvl5 - Zero-Trust Auth

```
┌─────────────────────────────────────────────────────┐
│  Connected as: [observer ▼]                         │
│                                                     │
│  observer  → can publish to nature.>                │
│  dashboard → can only subscribe                     │
│  admin     → full access                            │
├─────────────────────────────────────────────────────┤
│  [Publish test] ← works as observer, fails as dash  │
└─────────────────────────────────────────────────────┘
```

- Demonstrates NKeys/JWT auth
- Granular permissions per subject

### lvl7 - KV Counters (live state)

```
┌─────────────────────────────────────────────────────┐
│  Observations since [14:00 ▼]                       │
│                                                     │
│  🐦 Birds     │ 🦋 Insects   │ 🐿 Mammals          │
│      47       │      23      │       8              │
│                                                     │
│  🏆 Top: France (34) | UK (22) | Germany (12)      │
├─────────────────────────────────────────────────────┤
│              🌍 Globe                               │
└─────────────────────────────────────────────────────┘
```

- KV keys: `count.Aves`, `count.Insecta`, `count.by_country.FR`
- `kv.watch('count.>')` for reactive updates

## Key Concepts Progression

```
NATS Core              →  Auth        →  JetStream Stream  →  JetStream KV
    │                       │                  │                    │
pub/sub                 zero-trust         pub/sub +           shared state
fire & forget           NKeys/JWT          persistence         (specialized)
```

- **Core** = messages in flight, no storage
- **Auth** = who can pub/sub to what
- **Stream** = "What happened?" (event log, replay)
- **KV** = "What's the current state?" (last value)

## NATS Topics Structure

```
nature.Aves        # Birds
nature.Insecta     # Insects
nature.Mammalia    # Mammals
nature.Plantae     # Plants
nature.Fungi       # Fungi
nature.>           # All observations (wildcard)
```

## NATS Installation

### Local Development

```bash
# Option 1: Binary
brew install nats-server  # macOS
nats-server

# Option 2: Docker
docker run -p 4222:4222 nats:latest
```

### With JetStream (lvl6+)

```bash
# Same binary, just add the flag
nats-server --jetstream

# Or Docker
docker run -p 4222:4222 nats:latest --jetstream
```

### Production Options

1. **Synadia Cloud** (managed): `tls://connect.ngs.global`
2. **Self-hosted**: `nats-server` on your VPS with systemd
3. **Kubernetes**: Official Helm chart

## Stack

- **Runtime**: Bun
- **Framework**: Hono
- **Frontend**: Datastar + Rocket (Web Components)
- **3D**: Globe.gl / Three.js
- **Messaging**: NATS

## Development

```bash
# Terminal 1: NATS server
docker run -p 4222:4222 nats:latest

# Terminal 2: App
cd wildlive
bun install
bun run dev
```
