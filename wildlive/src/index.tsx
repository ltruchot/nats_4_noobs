import { ServerSentEventGenerator } from '@starfederation/datastar-sdk/web'
import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { getCookie, setCookie } from 'hono/cookie'
import {
  type ConsumerMessages,
  connect,
  DeliverPolicy,
  StringCodec,
} from 'nats'
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
const js = nc.jetstream()

// --- Per-user subscriptions ---

interface UserConnection {
  stream: ServerSentEventGenerator
  consumers: ConsumerMessages[]
}
const users = new Map<string, UserConnection>()
const userFilters = new Map<string, Record<string, boolean>>()

async function listen(conn: UserConnection, subject: string) {
  const consumer = await js.consumers.get('NATURE', {
    deliver_policy: DeliverPolicy.StartTime,
    opt_start_time: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    filterSubjects: subject,
  })
  const iter = await consumer.consume()
  conn.consumers.push(iter)
  for await (const msg of iter) {
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
  for (const iter of conn.consumers) iter.close()
  conn.consumers = []
  buildSubs(conn, filters)
}

function cleanup(uid: string) {
  const conn = users.get(uid)
  if (!conn) return
  for (const iter of conn.consumers) iter.close()
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
      const conn = { stream, consumers: [] as ConsumerMessages[] }
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
