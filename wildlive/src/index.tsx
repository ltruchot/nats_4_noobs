import { ServerSentEventGenerator } from '@starfederation/datastar-sdk/web'
import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { getCookie, setCookie } from 'hono/cookie'
import { connect, StringCodec, type Subscription } from 'nats'
import type { Observation } from '../../types/observation'
import { Home } from './views/Home'

// --- NATS connection (lvl2) ---

// iNaturalist iconic_taxon_name (lowercased)
const CATEGORIES = [
  'aves', // birds
  'mammalia', // mammals
  'insecta', // insects
  'plantae', // plants
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

async function listen(conn: UserConnection, subject: string) {
  const sub = nc.subscribe(subject)
  conn.subs.set(subject, sub)
  for await (const msg of sub) {
    const obs = JSON.parse(sc.decode(msg.data)) as Observation
    const { id, ...place } = obs
    try {
      conn.stream.patchSignals(JSON.stringify({ _places: { [id]: place } }))
    } catch {
      /* cleanup via onAbort */
    }
  }
}

function buildSubs(conn: UserConnection, filters: Record<string, boolean>) {
  const active = CATEGORIES.filter((c) => filters[c])
  if (active.length === 0) {
    listen(conn, 'nature.observation.>')
  } else {
    for (const cat of active) listen(conn, `nature.observation.${cat}`)
  }
}

function syncUserFilters(uid: string, filters: Record<string, boolean>) {
  const conn = users.get(uid)
  if (!conn) return
  for (const sub of conn.subs.values()) sub.unsubscribe()
  conn.subs.clear()
  buildSubs(conn, filters)
}

function cleanup(uid: string) {
  const conn = users.get(uid)
  if (!conn) return
  for (const sub of conn.subs.values()) sub.unsubscribe()
  users.delete(uid)
}

// --- Hono routes ---

const app = new Hono()

app.get('/', (c) => {
  if (!getCookie(c, 'uid')) {
    setCookie(c, 'uid', crypto.randomUUID())
  }
  return c.html(<Home />)
})

app.get('/sse', (c) => {
  const uid = getCookie(c, 'uid')
  if (!uid) return c.text('missing uid', 401)
  const filters = userFilters.get(uid) ?? {}

  return ServerSentEventGenerator.stream(
    (stream) => {
      cleanup(uid)
      const conn = { stream, subs: new Map<string, Subscription>() }
      users.set(uid, conn)
      buildSubs(conn, filters)
      stream.patchSignals(JSON.stringify({ filters }))
    },
    {
      keepalive: true,
      onAbort: () => cleanup(uid),
      onError: () => cleanup(uid),
    },
  )
})

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

app.use('/*', serveStatic({ root: './static' }))

export { app }

export default {
  port: Number(Bun.env.PORT),
  fetch: app.fetch,
  idleTimeout: 0,
}
