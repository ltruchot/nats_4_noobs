import { expect, test } from '@playwright/test'

test.describe('Home Page', () => {
  test('should load and display the page', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle('Wildlive')
  })

  test('should have rocket-globe with Three.js canvas', async ({ page }) => {
    await page.goto('/')
    const globe = page.locator('rocket-globe')
    await expect(globe).toBeAttached()

    // Wait for Three.js to initialize and create the canvas
    const canvas = globe.locator('canvas[data-engine^="three.js"]')
    await expect(canvas).toBeVisible({ timeout: 10000 })
    await expect(canvas).toHaveCSS('display', 'block')
  })

  test('should load static assets', async ({ page }) => {
    await page.goto('/')

    // Check favicon is loaded
    const favicon = page.locator('link[rel="icon"]')
    await expect(favicon).toHaveAttribute('href', '/favicon.svg')

    // Check stylesheet is loaded
    const stylesheet = page.locator('link[rel="stylesheet"]')
    await expect(stylesheet).toHaveAttribute('href', '/style.css')
  })

  test('should display wildlife observations from watcher', async ({
    page,
  }) => {
    await page.goto('/')

    // Wait for watcher poll (10s) + wildlive poll (10s) + rendering
    const marker = page.locator('.marker-wrapper')
    await expect(marker.first()).toBeVisible({ timeout: 30000 })
  })
})
