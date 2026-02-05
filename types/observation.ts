export interface Observation {
  id: number
  name: string
  lat: number
  lng: number
  photoUrl?: string | null
  wikiUrl?: string | null
  observedAt?: string
}
