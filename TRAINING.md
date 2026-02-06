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
├── types/
│   └── observation.ts           # Shared Observation type
├── Makefile                     # Root commands: make watcher, make app, make dev
└── TRAINING.md
```

- **main branch**: Final state with all NATS features
- **lvlX branches**: Each level builds on the previous

## Data Source

**iNaturalist API v2** - `fields` param selects only needed data (~500B vs ~50KB/observation)

```bash
curl "https://api.inaturalist.org/v2/observations?per_page=5&order=desc&photos=true&fields=id,species_guess,geojson,created_at,taxon.preferred_common_name,taxon.wikipedia_url,photos.url"
```

Types: `types/observation.ts`

Docs: https://api.inaturalist.org/v2/docs/

## Training Levels

| Level | Concept | Architecture | What You Learn |
|-------|---------|-------------|----------------|
| **lvl0** | Baseline | Watcher → HTTP → Wildlive | Starting point, no NATS yet |
| **lvl1** | Pub/Sub basics | Watcher → NATS → Wildlive | First NATS connection, decoupling |
| **lvl2** | Subjects + filters | Colored markers, toggle buttons | Subject routing, dynamic subscribe/unsubscribe |
| **lvl3** | Request/Reply | Click point → species details | Request/response pattern |
| **lvl4** | Auth zero-trust | Role switcher (observer/dashboard/admin) | NKeys, permissions |
| **lvl5** | JetStream Stream | Replay button + pause/resume | Persistence, history |
| **lvl6** | JetStream KV | Live counters per taxon | Shared state |

## Level Details

### lvl0 - Starting Point ✅

- A service (`inaturalist-watcher` :3001) regularly produces data (wildlife observations)
- Our app (`wildlive` :3000) wants to display it on a 3D globe
- Current approach: **wildlive polls the watcher via HTTP** every 1s

```
┌──────────────┐    SSE     ┌──────────────────┐  HTTP poll  ┌──────────────────┐
│   Browser    │◀───────────│     wildlive     │────────────▶│ inaturalist-     │
│  (Globe.gl)  │            │   :3000 (Hono)   │◀────────────│ watcher          │
└──────────────┘            └──────────────────┘   JSON      │ :3001            │
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
  - Polling = up to 1s latency → **not real-time**
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

- [x] **1. NATS infrastructure already configured**

The repo ships with everything needed to run NATS locally:

- `nats/docker-compose.yml` — NATS server container config
- `Makefile` — `make nats` (start) and `make nats-stop` (stop) targets
- `render.yaml` — production Blueprint with NATS as a private service (`pserv`)

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

`nc` = NATS Connection. `sc` = StringCodec, encodes/decodes messages (NATS transports bytes).

> **Why bytes?** NATS, Kafka, RabbitMQ — all transport opaque byte arrays (`Uint8Array`). Language agnostic + flexible. The broker never interprets content — it just moves bytes. Your app encodes (object → JSON string → bytes) and decodes (bytes → string → object).

In `inaturalist-watcher/src/index.ts`:

**a)** Add the `nats` import at the top:

```typescript
import { connect, StringCodec } from 'nats'
```

**b)** Replace the entire `// --- HTTP transport (lvl0) ---` section (`Bun.serve({...})`, its `console.log`, `setInterval`, and `ingest()` call) with:

```typescript
// --- NATS transport (lvl1) ---

const nc = await connect({ servers: 'localhost:4222' })
const sc = StringCodec()
console.log(`[watcher] connected to NATS at ${nc.getServer()}`)

setInterval(() => {
  for (const obs of buffer.splice(0, Math.ceil(Math.random() * 5))) {
    nc.publish('nature.observation', sc.encode(JSON.stringify(obs)))
  }
}, 1_000)

setInterval(ingest, 15_000)
ingest()
```

> The drain `setInterval` publishes 1–5 observations/second to NATS — same drip rhythm as the HTTP endpoint in lvl0.

- [ ] **5. wildlive: subscribe instead of HTTP poll**

In `wildlive/src/index.tsx`:

**a)** Add the `nats` import at the top:

```typescript
import { connect, StringCodec } from 'nats'
```

**b)** Replace `// --- Data source: HTTP poll (lvl0) ---` (the whole section + the `receiveObservations()` call) with:

```typescript
// --- Data source: NATS subscribe (lvl1) ---

const nc = await connect({ servers: 'localhost:4222' })
const sc = StringCodec()

async function receiveObservations() {
  console.log(`[wildlive] connected to NATS at ${nc.getServer()}`)
  for await (const msg of nc.subscribe('nature.observation')) {
    const obs = JSON.parse(sc.decode(msg.data)) as Observation
    broadcast(obs)
  }
}

receiveObservations()
```

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

- [ ] **7. Monitor with the NATS CLI**

```bash
brew install nats-io/nats-tools/nats
```

Subscribe to all messages in real-time from a terminal:

```bash
nats sub "nature.>"
```

You'll see every published observation scroll by — useful for debugging and understanding the message flow.

Also check the built-in HTTP monitoring at http://localhost:8222:
- `/connz` — active connections
- `/subsz` — active subscriptions

#### Before / After

| lvl0 (HTTP) | lvl1 (NATS) |
|-------------|-------------|
| Watcher exposes HTTP endpoint | Watcher publishes to NATS |
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

### lvl2 - Subjects + Filters 📋

```text
No filter → nature.observation.> (wildcard, all categories)

┌─────────────────────────────────────────────────────┐
│  [Aves]  [Mammalia]  [Insecta]  [Plantae]           │
│    ON       OFF          ON        OFF              │
├─────────────────────────────────────────────────────┤
│              🌍 Globe                               │
│    🔵 aves               ⚪ insecta                  │
│  (mammalia + plantae dropped — fire & forget)       │
└─────────────────────────────────────────────────────┘
```

**Goal:** Route observations by category using NATS subjects. Toggle buttons dynamically subscribe/unsubscribe per category, per user.

- NATS subjects = dot-delimited tokens (`nature.observation.aves`) → broker-level filtering
- Categories = iNaturalist `iconic_taxon_name` lowercased
- No filter active = wildcard `>` = all categories
- `>` matches any token: aves, mammalia, fungi, etc.
- Per-user: each SSE connection has its own NATS subscriptions via `uid` cookie
- CQRS: toggle = `POST 202`, observations flow through `GET /sse`
- Fire & forget: no subscriber = message dropped by broker

#### Checklist

- [ ] **1. `types/observation.ts`** — add `category?: string`
- [ ] **2. Watcher: categorize + publish by subject**

```typescript
// a) Replace INAT_FIELDS with:
const INAT_FIELDS =
  'id,species_guess,geojson,created_at,taxon.preferred_common_name,taxon.wikipedia_url,taxon.iconic_taxon_name,photos.url'

// b) In toObservation(), add:
category: (raw.taxon?.iconic_taxon_name ?? 'unknown').toLowerCase(),

// c) Replace publish setInterval:
setInterval(() => {
  const batch = buffer.splice(0, Math.ceil(Math.random() * 5))
  const grouped = Object.groupBy(batch, (obs) => obs.category ?? 'unknown')
  for (const [category, observations] of Object.entries(grouped)) {
    for (const obs of observations ?? []) {
      nc.publish(`nature.observation.${category}`, sc.encode(JSON.stringify(obs)))
    }
  }
}, 1_000)
```

- [ ] **3. Wildlive: per-user NATS subscriptions**

```typescript
// a) Add import:
import { getCookie, setCookie } from 'hono/cookie'
// Change nats import to:
import { connect, StringCodec, type Subscription } from 'nats'

// b) Replace "// --- Data source: NATS subscribe (lvl1) ---"
//    (nc, sc, receiveObservations, broadcast) with:

// --- NATS connection (lvl2) ---

const CATEGORIES = [
  'aves',      // birds
  'mammalia',  // mammals
  'insecta',   // insects
  'plantae',   // plants
]
const nc = await connect({ servers: 'localhost:4222' })
const sc = StringCodec()
console.log(`[wildlive] connected to NATS at ${nc.getServer()}`)

// --- Per-user subscriptions ---

interface UserConnection {
  stream: ServerSentEventGenerator
  subs: Map<string, Subscription>
}
const users = new Map<string, UserConnection>()
const userFilters = new Map<string, Record<string, boolean>>()

function listen(conn: UserConnection, subject: string) {
  const sub = nc.subscribe(subject)
  conn.subs.set(subject, sub)
  ;(async () => {
    for await (const msg of sub) {
      const obs = JSON.parse(sc.decode(msg.data)) as Observation
      const { id, ...place } = obs
      try {
        conn.stream.patchSignals(JSON.stringify({ _places: { [id]: place } }))
      } catch { /* cleanup via onAbort */ }
    }
  })()
}

function syncUserFilters(uid: string, filters: Record<string, boolean>) {
  const conn = users.get(uid)
  if (!conn) return
  for (const sub of conn.subs.values()) sub.unsubscribe()
  conn.subs.clear()
  const active = CATEGORIES.filter((c) => filters[c])
  if (active.length === 0) {
    listen(conn, 'nature.observation.>')
  } else {
    for (const cat of active) listen(conn, `nature.observation.${cat}`)
  }
}

function cleanup(uid: string) {
  const conn = users.get(uid)
  if (!conn) return
  for (const sub of conn.subs.values()) sub.unsubscribe()
  users.delete(uid)
}

// c) Replace GET / — set uid cookie on first visit
app.get('/', (c) => {
  if (!getCookie(c, 'uid')) setCookie(c, 'uid', crypto.randomUUID())
  return c.html(<Home />)
})

// d) Replace GET /sse — restore filters from server, push to client
app.get('/sse', (c) => {
  const uid = getCookie(c, 'uid')
  if (!uid) return c.text('missing uid', 401)
  const filters = userFilters.get(uid) ?? {}

  return ServerSentEventGenerator.stream(
    (stream) => {
      cleanup(uid)
      users.set(uid, { stream, subs: new Map() })
      syncUserFilters(uid, filters)
      stream.patchSignals(JSON.stringify({ filters }))
    },
    {
      keepalive: true,
      onAbort: () => cleanup(uid),
      onError: () => cleanup(uid),
    },
  )
})

// e) Add POST /toggle/:category — store filters, CQRS: 202
app.post('/toggle/:category', async (c) => {
  const cat = c.req.param('category')
  if (!CATEGORIES.includes(cat)) return c.text('invalid category', 400)
  const uid = getCookie(c, 'uid')
  if (!uid) return c.text('missing uid', 401)
  const { filters } = (await c.req.json()) as {
    filters: Record<string, boolean>
  }
  userFilters.set(uid, filters)
  syncUserFilters(uid, filters)
  return c.body(null, 202)
})
```

- [ ] **4. `Home.tsx`** — add `filters` signal + toggle buttons

```tsx
// Add filters to data-signals:
data-signals="{_places: {}, filters: {aves: false, mammalia: false, insecta: false, plantae: false}}"

// Add <nav> before <rocket-globe>:
<nav class="filters">
  <button type="button"
    data-on:click="$filters.aves = !$filters.aves; @post('/toggle/aves')"
    data-class:active="$filters.aves"
    class="filter-btn aves">Aves</button>
  <button type="button"
    data-on:click="$filters.mammalia = !$filters.mammalia; @post('/toggle/mammalia')"
    data-class:active="$filters.mammalia"
    class="filter-btn mammalia">Mammalia</button>
  <button type="button"
    data-on:click="$filters.insecta = !$filters.insecta; @post('/toggle/insecta')"
    data-class:active="$filters.insecta"
    class="filter-btn insecta">Insecta</button>
  <button type="button"
    data-on:click="$filters.plantae = !$filters.plantae; @post('/toggle/plantae')"
    data-class:active="$filters.plantae"
    class="filter-btn plantae">Plantae</button>
</nav>
```

- [ ] **5. `Globe.html`** — color markers by category

In `htmlElement()`, replace the hardcoded marker color with:

```javascript
const colors = { aves: '#3b82f6', mammalia: '#f59e0b', insecta: '#d1d5db', plantae: '#22c55e' }
const markerColor = colors[d.category] || '#9333ea'
// Use markerColor for icon.style.color, label.style.background, photo.style.borderColor
```

- [ ] **6. `style.css`** — add filter button styles

```css
.filters {
  position: absolute;
  top: 0.75rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  display: flex;
  gap: 0.5rem;
}

.filter-btn {
  padding: 0.4rem 0.8rem;
  border: 2px solid;
  border-radius: 1rem;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.2s, background 0.2s;
}
.filter-btn.active { opacity: 1; }
.filter-btn.aves { border-color: #3b82f6; }
.filter-btn.aves.active { background: #3b82f6; }
.filter-btn.mammalia { border-color: #f59e0b; }
.filter-btn.mammalia.active { background: #f59e0b; }
.filter-btn.insecta { border-color: #d1d5db; }
.filter-btn.insecta.active { background: #d1d5db; color: #000; }
.filter-btn.plantae { border-color: #22c55e; }
.filter-btn.plantae.active { background: #22c55e; }
```

- [ ] **7. Test**

```bash
make nats && make watcher && make app
```

- No toggle → wildcard → all markers
- Toggle "Aves" → blue markers only, rest dropped
- Reload → filters restored from server (uid cookie)
- `nats sub "nature.observation.>"` → messages routed by category

### lvl3 - Request/Reply 📋

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

### lvl4 - Zero-Trust Auth 📋

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

### lvl5 - JetStream Stream 📋

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

### lvl6 - JetStream KV 📋

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

```text
nature.observation.aves            # Aves = birds
nature.observation.mammalia        # Mammalia = mammals
nature.observation.insecta         # Insecta = insects
nature.observation.plantae         # Plantae = plants
nature.observation.fungi           # Fungi = mushrooms & molds
nature.observation.reptilia        # Reptilia = reptiles
nature.observation.arachnida       # Arachnida = spiders & scorpions
nature.observation.>               # All observations (wildcard)
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

### With JetStream (lvl5+)

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
