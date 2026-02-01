import { raw } from 'hono/html'
import type { FC, PropsWithChildren } from 'hono/jsx'
import { GlobeTemplate } from './components/wc-rocket/Globe'

export const Layout: FC<PropsWithChildren> = ({ children }) => (
  <>
    {raw('<!DOCTYPE html>')}
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="description" content="Wildlive" />
        <meta name="robots" content="noindex, nofollow" />
        <meta name="theme-color" content="#1e6091" />
        <title>Wildlive</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body>
        {children}
        <GlobeTemplate />
        <script type="module" src="/main.js" />
      </body>
    </html>
  </>
)
