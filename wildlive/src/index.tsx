import { ServerSentEventGenerator } from '@starfederation/datastar-sdk/web'
import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import cities from './data/cities.json'
import { Home } from './views/Home'

// Global state - runs forever on server start
let index = 0
const subscribers = new Set<ServerSentEventGenerator>()

// Fake poller - every second, push city info to all subscribers
setInterval(() => {
  // extract city info
  const city = cities[index % cities.length]
  if (!city) return
  const { lat, lng, name } = city

  // push city info to all subscribers
  for (const stream of subscribers) {
    stream.patchSignals(JSON.stringify({ places: { [name]: { lat, lng } } }))
  }
  index++
}, 1000)


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

export default app
