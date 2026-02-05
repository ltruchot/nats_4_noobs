import { Hono } from 'hono'

const queue = [
  { id: 1, name: 'American Robin', lat: 40.71, lng: -74.01 },
  { id: 2, name: 'Red Fox', lat: 34.05, lng: -118.24 },
  { id: 3, name: 'Monarch Butterfly', lat: 41.88, lng: -87.63 },
]

const app = new Hono()

app.get('/observations', (c) => {
  const count = Math.min(Math.floor(Math.random() * 3) + 1, queue.length)
  return c.json(queue.splice(0, count))
})

export default { port: 3001, fetch: app.fetch }
