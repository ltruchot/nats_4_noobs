import type { Observation } from "../../types/observation";
import { connect, StringCodec } from "nats";

// --- Ingestion ---

let buffer: Observation[] = [];
let lastId = 0;

async function ingest() {
  try {
    const results = await fetchObservations(lastId);
    if (results.length > 0) lastId = results[0].id;
    const observations = results.map(toObservation);
    buffer.push(...observations);
    console.log(`+${observations.length} ingested`);
  } catch {
    console.error("[watcher] fetch failed");
  }
}

// --- NATS transport (lvl0) ---

const nc = await connect({ servers: Bun.env.NATS_URL });
const sc = StringCodec();
console.log(`[watcher] connected to NATS at ${nc.getServer()}`);

setInterval(() => {
  for (const obs of buffer.splice(0, Math.ceil(Math.random() * 5))) {
    nc.publish("nature.observation", sc.encode(JSON.stringify(obs)));
  }
}, 1_000);

setInterval(ingest, 15_000);
ingest();

// --- iNaturalist API ---

function toObservation(raw: any): Observation {
  const [lng, lat] = raw.geojson?.coordinates ?? [0, 0];
  return {
    id: raw.id,
    name: raw.taxon?.preferred_common_name || raw.species_guess || "Unknown",
    lat,
    lng,
    photoUrl: raw.photos?.[0]?.url,
    wikiUrl: raw.taxon?.wikipedia_url,
    observedAt: raw.created_at?.match(/T(\d{2}:\d{2}:\d{2})/)?.[1],
  };
}

async function fetchObservations(idAbove: number) {
  const INAT_URL = "https://api.inaturalist.org/v2/observations";
  const INAT_FIELDS =
    "id,species_guess,geojson,created_at,taxon.preferred_common_name,taxon.wikipedia_url,photos.url";
  const params = new URLSearchParams({
    per_page: "150",
    order: "desc",
    photos: "true",
    fields: INAT_FIELDS,
    id_above: String(idAbove),
  });
  const res = await fetch(`${INAT_URL}?${params}`);
  if (!res.ok) throw new Error(`iNaturalist API error: ${res.status}`);
  const { results } = (await res.json()) as { results: any[] };
  return results;
}
