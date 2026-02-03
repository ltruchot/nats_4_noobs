/**
 * iNaturalist API v2 Types
 *
 * v2 returns minimal by default. Use `fields` param to select only what you need:
 * fields=id,species_guess,location,place_guess,geojson,taxon.id,taxon.name,taxon.preferred_common_name,taxon.wikipedia_url,taxon.iconic_taxon_name,photos.id,photos.url
 *
 * @see https://api.inaturalist.org/v2/docs/
 */

export interface Observation {
  uuid: string
  id: number
  species_guess: string | null
  location: string | null // "lat,lng" as string
  place_guess: string | null
  geojson: GeoJSON | null
  taxon: Taxon | null
  photos: Photo[]
}

export interface GeoJSON {
  type: 'Point'
  coordinates: [number, number] // [lng, lat]
}

export interface Taxon {
  id: number
  name: string // Scientific name: "Lophostrix cristata"
  preferred_common_name: string | null // "Crested Owl"
  wikipedia_url: string | null
  iconic_taxon_name: string | null // "Aves", "Plantae", "Fungi", etc.
}

export interface Photo {
  id: number
  url: string // square.jpg by default, replace "square" with "medium" or "original"
}

export interface ObservationsResponse {
  total_results: number
  page: number
  per_page: number
  results: Observation[]
}
