/**
 * iNaturalist API v2 Types
 * Only fields we request via: fields=id,species_guess,location,place_guess,taxon.wikipedia_url,photos.url
 */

export interface Observation {
  uuid: string
  id: number
  species_guess: string | null
  location: string | null // "lat,lng"
  place_guess: string | null
  taxon: Taxon | null
  photos: Photo[]
}

export interface Taxon {
  id: number
  wikipedia_url: string | null
}

export interface Photo {
  id: number
  url: string
}

export interface ObservationsResponse {
  total_results: number
  page: number
  per_page: number
  results: Observation[]
}
