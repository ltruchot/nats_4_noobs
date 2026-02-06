import type { FC } from 'hono/jsx'
import { Header } from './components/Header'
import { Layout } from './Layout'

export const Home: FC = () => (
  <Layout>
    <Header />
    <main
      data-init="@get('/sse')"
      data-signals="{_places: {}, filters: {aves: false, mammalia: false, insecta: false, plantae: false}}"
    >
      <nav class="filters">
        <button
          type="button"
          data-on:click="$filters.aves = !$filters.aves; @post('/toggle/aves')"
          data-class:active="$filters.aves"
          class="filter-btn aves"
        >
          Aves
        </button>
        <button
          type="button"
          data-on:click="$filters.mammalia = !$filters.mammalia; @post('/toggle/mammalia')"
          data-class:active="$filters.mammalia"
          class="filter-btn mammalia"
        >
          Mammalia
        </button>
        <button
          type="button"
          data-on:click="$filters.insecta = !$filters.insecta; @post('/toggle/insecta')"
          data-class:active="$filters.insecta"
          class="filter-btn insecta"
        >
          Insecta
        </button>
        <button
          type="button"
          data-on:click="$filters.plantae = !$filters.plantae; @post('/toggle/plantae')"
          data-class:active="$filters.plantae"
          class="filter-btn plantae"
        >
          Plantae
        </button>
      </nav>
      <rocket-globe data-attr:places="JSON.stringify($_places)"></rocket-globe>
    </main>
  </Layout>
)
