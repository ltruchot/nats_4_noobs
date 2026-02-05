import type { Observation } from '../../types/observation'
import fallback from './data/fallback.json'

// --- Ingestion ---

let buffer: Observation[] = []
let lastId = 0
let fallbackUsed = false

async function ingest() {
  try {
    const results = await fetchObservations(lastId)
    if (results.length === 0) return

    lastId = results[0].id
    const observations = results.map(toObservation)
    buffer.push(...observations)
    console.log(`+${observations.length} ingested`)
  } catch {
    if (!fallbackUsed) {
      fallbackUsed = true
      buffer.push(...fallback)
      console.log(`API down — loaded ${fallback.length} fallback observations`)
    }
  }
}

// --- HTTP transport (lvl0) ---

Bun.serve({
  port: 3001,
  fetch() {
    return Response.json(buffer.splice(0, 10))
  },
})
console.log('[inaturalist-watcher] http://localhost:3001')

if (Bun.env.FALLBACK) {
  buffer = [...fallback]
  console.log(`[fallback] loaded ${fallback.length} observations`)
} else {
  setInterval(ingest, 15_000)
  ingest()
}

// --- iNaturalist API ---

function toObservation(raw: any): Observation {
  const [lng, lat] = raw.geojson?.coordinates ?? [0, 0]
  return {
    id: raw.id,
    name: raw.taxon?.preferred_common_name || raw.species_guess || 'Unknown',
    lat,
    lng,
    photoUrl: raw.photos?.[0]?.url,
    wikiUrl: raw.taxon?.wikipedia_url,
  }
}

async function fetchObservations(idAbove: number) {
  const INAT_URL = 'https://api.inaturalist.org/v2/observations'
  const INAT_FIELDS =
    'id,species_guess,geojson,taxon.preferred_common_name,taxon.wikipedia_url,photos.url'
  const params = new URLSearchParams({
    per_page: '150',
    order: 'desc',
    photos: 'true',
    fields: INAT_FIELDS,
    id_above: String(idAbove),
  })
  const res = await fetch(`${INAT_URL}?${params}`)
  const { results } = (await res.json()) as { results: any[] }
  return results
}
