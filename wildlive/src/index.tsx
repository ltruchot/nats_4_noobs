import { ServerSentEventGenerator } from '@starfederation/datastar-sdk/web'
import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import type { Observation } from '../../types/observation'
import { Home } from './views/Home'

// --- SSE subscribers ---

const subscribers = new Set<ServerSentEventGenerator>()

// --- Broadcast (transport-agnostic) ---

function broadcast({ id, ...place }: Observation) {
  for (const stream of subscribers) {
    try {
      stream.patchSignals(JSON.stringify({ places: { [id]: place } }))
    } catch {
      subscribers.delete(stream)
    }
  }
}

// --- Data source: HTTP poll (lvl0) ---
async function receiveObservations() {
  console.log(`[wildlive] polling ${Bun.env.WATCHER_URL} every 1s`)

  while (true) {
    const observations = await fetch(`${Bun.env.WATCHER_URL}/last-observations`)
      .then((r) => r.json() as Promise<Observation[]>)
      .catch(() => [] as Observation[])
    for (const obs of observations) broadcast(obs)
    await Bun.sleep(1_000)
  }
}

receiveObservations()

// --- Hono routes ---

const app = new Hono()

app.get('/', (c) => c.html(<Home />))

app.get('/sse', () => {
  let currentStream: ServerSentEventGenerator | undefined

  return ServerSentEventGenerator.stream(
    (stream) => {
      currentStream = stream
      subscribers.add(currentStream)
    },
    {
      keepalive: true,
      onAbort: () => {
        if (currentStream) subscribers.delete(currentStream)
      },
      onError: () => {
        if (currentStream) subscribers.delete(currentStream)
      },
    },
  )
})

app.use('/*', serveStatic({ root: './static' }))

export { app }

export default {
  port: Number(Bun.env.PORT),
  fetch: app.fetch,
  idleTimeout: 0,
}
