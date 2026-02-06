import type { Observation } from '../../types/observation'

// --- Ingestion ---

let buffer: Observation[] = []
let lastId = 0

async function ingest() {
  try {
    const results = await fetchObservations(lastId)
    if (results.length > 0) lastId = results[0].id
    const observations = results.map(toObservation)
    buffer.push(...observations)
    console.log(`+${observations.length} ingested`)
  } catch {
    console.error('[watcher] fetch failed')
  }
}

// --- NATS transport (lvl2) ---

import { connect, StringCodec, nanos } from 'nats'

const nc = await connect({ servers: 'localhost:4222' })
const sc = StringCodec()
console.log(`[watcher] connected to NATS at ${nc.getServer()}`)

const jsm = await nc.jetstreamManager()
await jsm.streams.add({
  name: 'NATURE',
  subjects: ['nature.observation.>'],
  max_age: nanos(10 * 60 * 1000), // 10 minutes
})
console.log('[watcher] NATURE stream ready')

setInterval(() => {
  const batch = buffer.splice(0, Math.ceil(Math.random() * 5))
  const grouped = Object.groupBy(batch, (obs) => obs.category ?? 'unknown')
  for (const [category, observations] of Object.entries(grouped)) {
    for (const obs of observations ?? []) {
      nc.publish(`nature.observation.${category}`, sc.encode(JSON.stringify(obs)))
    }
  }
}, 1_000)

setInterval(ingest, 15_000)
ingest()

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
    observedAt: raw.created_at?.match(/T(\d{2}:\d{2}:\d{2})/)?.[1],
    category: (raw.taxon?.iconic_taxon_name ?? 'unknown').toLowerCase(),
  }
}

async function fetchObservations(idAbove: number) {
  const INAT_URL = 'https://api.inaturalist.org/v2/observations'
  const INAT_FIELDS =
    'id,species_guess,geojson,created_at,taxon.preferred_common_name,taxon.wikipedia_url,taxon.iconic_taxon_name,photos.url'
  const params = new URLSearchParams({
    per_page: '150',
    order: 'desc',
    photos: 'true',
    fields: INAT_FIELDS,
    id_above: String(idAbove),
  })
  const res = await fetch(`${INAT_URL}?${params}`)
  if (!res.ok) throw new Error(`iNaturalist API error: ${res.status}`)
  const { results } = (await res.json()) as { results: any[] }
  return results
}
