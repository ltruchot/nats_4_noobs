import type { FC } from 'hono/jsx'
import { Header } from './components/Header'
import { Layout } from './Layout'

export const Home: FC = () => (
  <Layout>
    <Header />
    <main data-init="@get('/sse')" data-signals="{places: {}}">
      <rocket-globe data-attr:places="JSON.stringify($places)"></rocket-globe>
    </main>
  </Layout>
)
