import { raw } from 'hono/html'
import globeHtml from './Globe.html' with { type: 'text' }

export const GlobeTemplate = () => raw(globeHtml)
