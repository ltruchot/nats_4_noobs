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

```
nats_4_noobs/
├── nats/
│   └── docker-compose.yml       # NATS server (evolves per level)
├── inaturalist-watcher/
│   └── src/index.ts             # Polls iNaturalist, serves HTTP (lvl0) → publishes NATS (lvl1)
├── wildlive/
│   └── src/                     # Bun + Hono globe app
├── Makefile                     # Root commands: make watcher, make app, make dev
└── TRAINING.md
```

- **main branch**: Final state with all NATS features
- **lvlX branches**: Each level builds on the previous

## Data Source

**iNaturalist API v2** - `fields` param selects only needed data (~500B vs ~50KB/observation)

```bash
curl "https://api.inaturalist.org/v2/observations?place_id=1&per_page=100&order=desc&photos=true&fields=id,species_guess,geojson,taxon.preferred_common_name,photos.url"
```

Types: `wildlive/src/types/inaturalist.ts` | Place IDs: USA=1, Europe=97391, France=6753

Docs: https://api.inaturalist.org/v2/docs/

## Training Levels

| Level | Concept | Architecture | What You Learn |
|-------|---------|-------------|----------------|
| **lvl0** | Baseline | Watcher → HTTP → Wildlive | Starting point, no NATS yet |
| **lvl1** | Pub/Sub basics | Watcher → NATS → Wildlive | First NATS connection, decoupling |
| **lvl2** | Subjects | Points colored by taxon | Message routing |
| **lvl3** | Wildcards + filters | Toggle buttons per taxon | Dynamic subscribe/unsubscribe |
| **lvl4** | Request/Reply | Click point → species details | Request/response pattern |
| **lvl5** | Auth zero-trust | Role switcher (observer/dashboard/admin) | NKeys, permissions |
| **lvl6** | JetStream Stream | Replay button + pause/resume | Persistence, history |
| **lvl7** | JetStream KV | Live counters per taxon | Shared state |

## Level Details

### lvl0 - Starting Point ✅

- A service (`inaturalist-watcher` :3001) regularly produces data (wildlife observations)
- Our app (`wildlive` :3000) wants to display it on a 3D globe
- Current approach: **wildlive polls the watcher via HTTP** every 1s

```
┌──────────────┐    SSE     ┌──────────────────┐  HTTP poll  ┌──────────────────┐
│   Browser    │◀───────────│     wildlive     │────────────▶│ inaturalist-     │
│  (Globe.gl)  │            │   :3000 (Hono)   │◀────────────│ watcher          │
└──────────────┘            └──────────────────┘   JSON      │ :3001 (Hono)     │
                                                             └────────┬─────────┘
                                                                      ▼
                                                              iNaturalist API
```

```bash
make watcher   # Terminal 1
make app       # Terminal 2
# → http://localhost:3000
```

- It works, **but:**
  - Wildlive must know the watcher's URL → **coupling**
  - Only one consumer can drain the buffer → **no fan-out**
  - Polling /10s = up to 10s latency → **not real-time**
  - If watcher restarts, buffer is lost → **no persistence**

### lvl1 - Pub/Sub Basics 📋

```
┌──────────────────┐                        ┌──────────────┐
│  inaturalist-    │                        │   wildlive   │
│  watcher         │                        │   (globe)    │
│  (publisher)     │                        │ (subscriber) │
└────────┬─────────┘                        └──────▲───────┘
         │           ┌──────────────┐              │
         └──────────▶│  NATS Server │──────────────┘
          publish    │  :4222       │   subscribe
                     └──────────────┘
```

**Goal:** Watcher publishes to NATS, wildlive subscribes. No more HTTP between the two.

#### Checklist

- [x] **1. NATS server already configured** *(docker-compose.yml present)*

```yaml
# nats/docker-compose.yml
services:
  nats:
    image: nats:2.12-alpine
    container_name: nats
    ports:
      - "4222:4222"   # Client connections
      - "8222:8222"   # Monitoring UI
    command: ["--http_port", "8222"]
```

- [ ] **2. Start NATS + verify**

```bash
make nats
# Open http://localhost:8222 → NATS monitoring dashboard
```

- [ ] **3. Install NATS client in both services**

```bash
cd inaturalist-watcher && bun add nats
cd ../wildlive && bun add nats
```

- [ ] **4. inaturalist-watcher: publish to NATS instead of HTTP**

`toObservation()` and `ingest()` stay untouched. We only replace the **transport section** at the bottom.

`nc` = NATS Connection, our pub/sub client. `sc` = StringCodec, encodes/decodes messages (NATS transports bytes).

> **Why bytes?** NATS, Kafka, RabbitMQ — all transport opaque byte arrays (`Uint8Array`). Language agnostic + flexible. The broker never interprets content — it just moves bytes. Your app encodes (object → JSON string → bytes) and decodes (bytes → string → object).

In `inaturalist-watcher/src/index.ts`:

**a)** Add the `nats` import at the top:

```typescript
import { connect, StringCodec } from 'nats'
```

**b)** In `ingest()`, replace `buffer.push(...observations)` with publishing each observation:

```typescript
    const sc = StringCodec()
    for (const obs of observations) {
      nc.publish('nature.observation', sc.encode(JSON.stringify(obs)))
    }
```

**c)** Replace `// --- HTTP transport (lvl0) ---` (everything below) with:

```typescript
// --- NATS transport (lvl1) ---

const nc = await connect({ servers: 'localhost:4222' })
console.log(`[watcher] connected to NATS at ${nc.getServer()}`)

if (Bun.env.FALLBACK) {
  buffer = [...fallback]
  console.log(`[fallback] loaded ${fallback.length} observations`)
} else {
  setInterval(ingest, 15_000)
  ingest()
}
```

- [ ] **5. wildlive: subscribe instead of HTTP poll**

Same idea — `broadcast()` and Hono routes stay untouched. Only the data source changes.

In `wildlive/src/index.tsx`:

**a)** Add the `nats` import:

```typescript
import { connect, StringCodec } from 'nats'
const nc = await connect({ servers: 'localhost:4222' })
const sc = StringCodec()
```

**b)** Replace `// --- Data source: HTTP poll (lvl0) ---` (the whole section) with:

```typescript
// --- Data source: NATS subscribe (lvl1) ---
async function receiveObservations() {
  console.log(`[wildlive] connected to NATS at ${nc.getServer()}`)
  
  // sc.decode: Uint8Array → string — same broadcast() as HTTP
  for await (const msg of nc.subscribe('nature.observation')) {
    const obs = JSON.parse(sc.decode(msg.data)) as Observation
    broadcast(obs)
  }
}


- [ ] **6. Test the full flow**

```bash
# Terminal 1 — NATS
make nats

# Terminal 2 — Watcher (publishes to NATS)
make watcher

# Terminal 3 — Wildlive (subscribes from NATS)
make app
```

**Verify:**
- http://localhost:3000 → Globe with worldwide wildlife observations
- http://localhost:8222 → NATS monitoring (connections: 2, messages flowing)

#### Before / After

| lvl0 (HTTP) | lvl1 (NATS) |
|-------------|-------------|
| Watcher exposes HTTP endpoint | Watcher drip-publishes to NATS |
| Wildlive polls watcher via HTTP | Wildlive subscribes from NATS |
| Wildlive knows watcher URL → **coupled** | Neither knows the other → **decoupled** |
| One consumer drains buffer | Any number of subscribers |
| ~1s delay (polling) | Real-time push (< 1ms) |

#### Architecture lvl1

```
┌──────────────────┐                    ┌──────────────────┐
│ inaturalist-     │                    │    wildlive      │
│ watcher          │                    │    (Hono + SSE)  │
│ (poll + publish) │                    │ (subscribe + SSE)│
└────────┬─────────┘                    └────────▲─────────┘
         │                                       │
         │         nature.observation            │
         ▼                                       │
┌────────────────────────────────────────────────┴──────┐
│                    NATS Server                        │
│                 localhost:4222                  Docker │
└───────────────────────────────────────────────────────┘
```

### lvl2 - Subjects 📋

```
┌─────────────────────────────────────────────────────┐
│              🌍 Globe                               │
│    🔵 bird   🟢 insect   🟡 mammal   🟣 plant      │
└─────────────────────────────────────────────────────┘
```

- Publisher routes by taxon: `nature.Aves`, `nature.Insecta`, etc.
- Subscriber on `nature.>` receives all
- Points colored by subject/taxon
- Understand subject hierarchy

### lvl3 - Subscription Filters 📋

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
- Datastar manages reactive button state

### lvl4 - Request/Reply 📋

```
┌─────────────────────────────────────────────────────┐
│              🌍 Globe                               │
│                  📍 ← click                         │
├─────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────┐               │
│  │ 📷 [Photo]                      │               │
│  │ American Robin                  │               │
│  │ Erithacus rubecula              │               │
│  │ 📍 Rennes, France               │               │
│  │ 👤 naturalist42                 │               │
│  └─────────────────────────────────┘               │
└─────────────────────────────────────────────────────┘
```

- Click → `nc.request('species.details', id)` → response with enriched data
- Responder service fetches additional info from iNaturalist API

### lvl5 - Zero-Trust Auth 📋

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
- Switch roles to see permission errors

### lvl6 - JetStream Stream 📋

```
┌─────────────────────────────────────────────────────┐
│  [▶ Live]  [⏸ Pause]  [⏪ Replay 5min]              │
│                                                     │
│              🌍 Globe                               │
│     (shows history when replaying)                 │
└─────────────────────────────────────────────────────┘
```

- Enable `--jetstream` flag
- Create NATURE stream on `nature.>`
- Replay: fetch observations from the last N minutes
- Pause/Resume: stop receiving, then catch up
- Demonstrates persistence and delivery policies

### lvl7 - JetStream KV 📋

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
- Time selector resets counters

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
# Install dependencies
make install

# lvl0: Two terminals
make watcher       # Terminal 1 - iNaturalist poller (:3001)
make app           # Terminal 2 - Globe app (:3000)

# lvl1+: Three terminals
make nats          # Terminal 1 - NATS server
make watcher       # Terminal 2 - Publisher
make app           # Terminal 3 - Subscriber

# Other commands
make nats-stop     # Stop NATS
make lint          # Biome lint
make test          # Unit tests
```
