import { describe, expect, test } from 'bun:test'
import { app } from '../../src/index'

describe('Hono App', () => {
  test('GET / returns HTML with Wildlive title', async () => {
    const res = await app.request('/')
    expect(res.status).toBe(200)

    const html = await res.text()
    expect(html).toContain('<title>Wildlive</title>')
    expect(html).toContain('rocket-globe')
  })

  test('GET /favicon.svg returns SVG', async () => {
    const res = await app.request('/favicon.svg')
    expect(res.status).toBe(200)
  })

  test('GET /style.css returns CSS', async () => {
    const res = await app.request('/style.css')
    expect(res.status).toBe(200)
  })
})
