import type { FC } from 'hono/jsx'
import { Header } from './components/Header'
import { Layout } from './Layout'

export const Home: FC = () => (
  <Layout>
    <Header />
    <main data-init="@get('/sse')" data-signals="{_places: {}}">
      <rocket-globe data-attr:places="JSON.stringify($_places)"></rocket-globe>
    </main>
  </Layout>
)
