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
│   └── docker-compose.yml   # NATS server (evolves per level)
├── wildlive/
│   └── src/                 # Bun + Hono app
├── Makefile                 # Root commands: make nats, make app, make dev
├── CLAUDE.md                # This file
└── README.md
```

- **main branch**: Final state with all NATS features
- **lvlX branches**: Each level builds on the previous

## Data Source

**iNaturalist USA API** - Real-time wildlife observations

```bash
curl "https://api.inaturalist.org/v1/observations?place_id=1&per_page=30&order=desc&photos=true"
```

Useful place IDs: USA=1, North America=97394, Europe=97391, France=6753

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

### lvl0 - Baseline ✅

```
┌─────────────────────────────────────────────────────┐
│              🌍 Globe.gl                            │
│         Points appearing via SSE stream             │
│            (US cities mock data)                    │
└─────────────────────────────────────────────────────┘
```

- Working Bun + Hono + Datastar app
- SSE endpoint streams coordinates to frontend
- Globe.gl renders points in real-time
- No NATS yet - this is the starting point

### lvl1 - Pub/Sub Basics 📋

```
┌──────────────┐     ┌──────────┐     ┌──────────────┐
│ iNaturalist  │────▶│   NATS   │────▶│    Globe     │
│   poller     │     │  Server  │     │  (frontend)  │
└──────────────┘     └──────────┘     └──────────────┘
```

**Goal:** Replace direct SSE push with NATS pub/sub in between.

#### Checklist

- [x] **1. Setup monorepo structure** *(already present)*

```
nats_4_noobs/
├── nats/
│   └── docker-compose.yml    # NATS server config (evolves per level)
├── wildlive/
│   └── ...                   # Bun app
├── Makefile                  # Root commands
└── CLAUDE.md
```

- [x] **2. Create `nats/docker-compose.yml`** *(already present)*

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
    # lvl6+ will add: --jetstream --store_dir /data
    # lvl6+ will add: volumes for persistence
```

- [ ] **3. Edit root `Makefile`** *(add NATS targets)*

```makefile
# Start NATS server in background
nats:
	docker compose -f nats/docker-compose.yml up -d

# Stop NATS
nats-stop:
	docker compose -f nats/docker-compose.yml down
```

- [ ] **4. Test NATS is running**

```bash
make nats
# Open http://localhost:8222 → NATS monitoring dashboard
```

- [ ] **5. Install NATS client package**

```bash
cd wildlive
bun add nats
```

- [ ] **6. Create `.env` file**

```bash
# wildlive/.env
NATS_URL=localhost:4222
```

- [ ] **7. In `src/index.tsx`, add NATS connection**

`nc` = NATS Connection, our pub/sub client. `sc` = StringCodec, encodes/decodes messages (NATS transports bytes).

```typescript
import { connect, StringCodec } from 'nats'

const nc = await connect({ servers: process.env.NATS_URL })
console.log(`Connected to NATS at ${nc.getServer()}`)

const sc = StringCodec()
```

- [ ] **8. In `src/index.tsx`, add a function to fetch iNaturalist**

Simple fetch that returns observations. We keep `Record<string, any>` for now, we'll type it later.

```typescript
type Observation = Record<string, any>

async function getObservations(): Promise<Observation[]> {
  const res = await fetch('https://api.inaturalist.org/v1/observations?place_id=1&per_page=100&order=desc&photos=true')
  const data = await res.json()
  return data.results
}
```

- [ ] **9. Add iNaturalist poller to `src/index.tsx`**

Poll every 3s. `lastId` avoids re-processing the same observations (the API returns the last 100, not "since last request").

```typescript
let lastId = 0

setInterval(async () => {
  const observations = await getObservations()
  for (const obs of observations) {
    if (obs.id > lastId && obs.location) {
      console.log(`New: ${obs.species_guess} at ${obs.place_guess}`)
    }
  }
  if (observations.length > 0) {
    lastId = Math.max(lastId, observations[0].id)
  }
}, 3000)
```

- [ ] **10. Publish to NATS instead of console.log**

Replace `console.log` with `nc.publish`. The message goes to the subject `nature.observation`.

```typescript
const [lat, lng] = obs.location.split(',').map(Number)
const payload = { id: obs.id, name: obs.species_guess, lat, lng }
nc.publish('nature.observation', sc.encode(JSON.stringify(payload)))
```

- [ ] **11. Replace `setInterval` with NATS subscribe**

Same pattern as cities: one NATS subscription at top level that pushes to all `subscribers`. The `/sse` endpoint stays unchanged.

```typescript
// Replace the cities setInterval with:
const sub = nc.subscribe('nature.observation')

;(async () => {
  for await (const msg of sub) {
    const { name, lat, lng } = JSON.parse(sc.decode(msg.data))
    for (const stream of subscribers) {
      try {
        stream.patchSignals(JSON.stringify({ places: { [name]: { lat, lng } } }))
      } catch {
        subscribers.delete(stream)
      }
    }
  }
})()
```

- [ ] **12. Test the full flow**

```bash
# Terminal 1
make nats

# Terminal 2
make dev
```

**Verify:**
- http://localhost:3000 → Globe with USA wildlife observations
- http://localhost:8222 → NATS monitoring dashboard (connections, messages)

#### Architecture After lvl1

```
┌─────────────────────────────────────────────────────────────┐
│                        Bun Server                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │  Publisher      │    │  Subscriber     │                │
│  │  (iNaturalist)  │    │  (SSE push)     │                │
│  └────────┬────────┘    └────────▲────────┘                │
│           │                      │                          │
│           │    nature.observation│                          │
│           ▼                      │                          │
│  ┌───────────────────────────────┴──────┐                  │
│  │              NATS Server             │ ← Docker         │
│  │           localhost:4222             │                  │
│  └──────────────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

#### What Changed from lvl0

| Before (lvl0) | After (lvl1) |
|---------------|--------------|
| Direct `setInterval` → SSE | Publisher → NATS → Subscriber → SSE |
| US cities mock data | Real iNaturalist USA API |
| No decoupling | Publisher/Subscriber decoupled |

#### Environment Variables

```bash
# .env (optional, defaults to localhost)
NATS_URL=localhost:4222
```

#### Production Note (Render/Fly.io)

For production, options are:
1. **Synadia Cloud** (managed NATS): `NATS_URL=tls://connect.ngs.global`
2. **Sidecar Docker** on Render: Deploy `nats/docker-compose.yml` as private service
3. **Fly.io**: Deploy NATS as separate app with internal networking

The `docker-compose.yml` will evolve at each level (JetStream, volumes, etc.)

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
cd wildlive && bun install

# Option A: Two terminals
make nats          # Terminal 1 - NATS server
make app           # Terminal 2 - Bun app

# Option B: Single command
make dev           # NATS background + app foreground

# Other commands
make nats-stop     # Stop NATS
make nats-logs     # View NATS logs
```
