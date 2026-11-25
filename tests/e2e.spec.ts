import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const isLive = Boolean(process.env.SAANS_TEST_URL);
const PAGES = [
  { hash: '#today', heading: 'Your air plan today' },
  { hash: '#planner', heading: 'Plan your day' },
  { hash: '#indoor', heading: 'Make home air cleaner' },
  { hash: '#impact', heading: 'Compare your routines' },
  { hash: '#assistant', heading: 'Ask SaansAI' },
];

test.describe('SaansAI end-to-end journeys and accessibility', () => {
  test('navigates all views, searches cities, updates planner, runs impact and assistant', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Your air plan today' })).toBeVisible();
    await expect(page.locator('.readout strong')).toHaveText(isLive ? /^\d+$/ : '88');

    // Open city picker, verify empty search does not prematurely flip on edit, then search Pune
    await page.getByRole('button', { name: /New Delhi, India/i }).click();
    await page.getByLabel('City or neighbourhood').fill('zzzzqqqq99');
    await page.getByRole('button', { name: /^Search$/ }).click();
    await expect(page.locator('dialog [aria-live="polite"]')).toContainText('No matches');
    await page.getByLabel('City or neighbourhood').fill('110001');
    await expect(page.locator('dialog [aria-live="polite"]')).toContainText('No matches');
    await page.getByLabel('City or neighbourhood').fill('Pune');
    await page.getByRole('button', { name: /^Search$/ }).click();
    await page.getByRole('button', { name: 'Pune Maharashtra' }).click();
    await expect(page.getByRole('button', { name: /Pune, India/i })).toBeVisible();

    // Toggle Hindi quick tips
    await page.getByRole('button', { name: 'Toggle Hindi quick tips' }).click();
    await expect(page.getByRole('button', { name: 'Toggle Hindi quick tips' })).toHaveAttribute('aria-pressed', 'true');

    // Daily planner checklist + persistence
    await page.getByRole('link', { name: 'Daily planner' }).click();
    await expect(page.getByRole('heading', { name: 'Plan your day' })).toBeVisible();
    const firstCheck = page.locator('.check-action input').first();
    await firstCheck.check();
    await expect(firstCheck).toBeChecked();
    await page.reload();
    await expect(page.locator('.check-action input').first()).toBeChecked();

    // Indoor air budget tabs
    await page.getByRole('link', { name: 'Indoor air' }).click();
    await page.getByRole('button', { name: 'Premium' }).click();
    await expect(page.getByRole('heading', { name: 'Filter the room you use most' })).toBeVisible();

    // Impact simulator preset
    await page.getByRole('link', { name: 'Impact simulator' }).click();
    await page.getByRole('button', { name: 'Avoid a trip' }).click();
    await expect(page.getByText('Tailpipe CO₂ avoided', { exact: true })).toBeVisible();

    // Ask SaansAI quick prompt
    await page.getByRole('navigation').getByRole('link', { name: 'Ask SaansAI' }).click();
    await page.getByRole('button', { name: 'Should I open the windows?' }).click();
    await expect(page.getByRole('log', { name: 'Assistant responses' })).toContainText(
      isLive ? /Current modeled US AQI \d+/ : 'Current modeled US AQI 88',
      { timeout: 15_000 },
    );
  });

  test('passes axe WCAG accessibility checks across desktop and mobile viewports', async ({ page }) => {
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      for (const route of PAGES) {
        await page.goto('/' + route.hash);
        await expect(page.getByRole('heading', { name: route.heading })).toBeVisible();
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        expect(results.violations, `Axe violations on ${route.hash} at ${viewport.width}px`).toEqual([]);
      }
    }
  });
});
