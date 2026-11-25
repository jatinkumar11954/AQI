import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { CITIES, EMPTY_ENV } from '../src/shared/model';
import { modeled } from './fixtures';

const currentTime = () => Math.floor(Date.now() / 1000);
const fixture = (page: Page) => page.route('**/api/environment?*', route => route.fulfill({ json: modeled(currentTime()) }));
const gotForecast = async (page: Page) => {
  await expect(page.getByText('Current model', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Forecast metric')).toBeVisible();
};
const nav = (page: Page, label: string) => page.getByRole('navigation').getByRole('link', { name: label, exact: true });
const accessibilityTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

test('reads modeled air, explores hours, finds a city and updates the forecast request', async ({ page }) => {
  await fixture(page);
  await page.route('**/api/places?q=Pune', route => route.fulfill({ json: { places: [{ name: 'Pune', state: 'Maharashtra', lat: 18.52, lon: 73.86 }] } }));
  await page.goto('/');
  await gotForecast(page);
  await page.getByRole('button', { name: '48h' }).click();
  await expect(page.getByRole('button', { name: '48h' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Forecast metric').selectOption('pm25');
  await page.getByText('View forecast as a table').click();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'PM2.5 (µg/m³)' })).toBeVisible();
  await page.getByRole('button', { name: 'New Delhi, India' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('City or neighbourhood').fill('Pune');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const request = page.waitForRequest(req => req.url().includes('/api/environment?lat=18.52&lon=73.86'));
  await page.getByRole('button', { name: 'Pune Maharashtra' }).click();
  await request;
  await expect(page.getByRole('button', { name: 'Pune, India' })).toBeVisible();
  await gotForecast(page);
});

test('applies a household preset, persists settings and checks off a daily action', async ({ page }) => {
  await fixture(page);
  await page.goto('/#planner');
  await page.getByRole('button', { name: /Senior at home/ }).click();
  await expect(page.getByRole('button', { name: 'Lucknow, India' })).toBeVisible();
  await expect(page.getByLabel('Older adults', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Household budget')).toHaveValue('low');
  await expect(page.getByText('Open your daily plan')).toHaveCount(0);
  await expect(page.locator('.action-list')).not.toContainText('school advisories');
  const checkbox = page.getByRole('checkbox', { name: 'Plan for older family members completed' });
  await checkbox.check();
  await expect(page.getByText(/1 of 4 complete/)).toBeVisible();
  await page.reload();
  await expect(checkbox).toBeChecked();
  await nav(page, 'Indoor air').click();
  await expect(page.getByRole('button', { name: 'Low budget', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Premium', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Filter the room you use most' })).toBeVisible();
  await page.getByRole('button', { name: 'Use this budget in my plan' }).click();
  await nav(page, 'Daily planner').click();
  await expect(page.getByLabel('Household budget')).toHaveValue('premium');
});

test('changes both travel scenarios and computes the forecast exposure proxy', async ({ page }) => {
  await fixture(page);
  await page.goto('/#impact');
  await expect(page.getByText('12.5 kg', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Try transit' }).click();
  await expect(page.getByLabel('Extra fare or trip cost (₹/day)')).toHaveValue('50');
  await page.getByLabel('Petrol vehicle efficiency (km/L)').fill('0');
  await expect(page.getByText(/Complete each input/)).toBeVisible();
  await page.getByLabel('Current forecast hour').selectOption({ index: 1 });
  await page.getByLabel('Alternative forecast hour').selectOption({ index: 2 });
  await expect(page.getByText('Lower outdoor proxy')).toBeVisible();
  await page.getByLabel('Current outdoor minutes').fill('65');
  await expect(page.getByLabel('Current outdoor minutes')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText(/Enter whole outdoor minutes/)).toBeVisible();
  await page.getByLabel('Current outdoor minutes').fill('25');
  await page.getByLabel('Petrol vehicle efficiency (km/L)').fill('15');
  await page.getByText('Formulas and assumptions').click();
  await expect(page.getByText(/Litres = distance/)).toBeVisible();
});

test('uses a real API rules path and keeps functionality if all feeds are unavailable', async ({ page }) => {
  await page.route('**/api/environment?*', route => route.fulfill({ json: EMPTY_ENV }));
  await page.goto('/');
  await expect(page.getByText('Feed unavailable')).toBeVisible();
  await expect(page.getByText('No suitable window')).toBeVisible();
  await nav(page, 'Ask SaansAI').click();
  await page.getByRole('button', { name: 'Should I open the windows?' }).click();
  const answer = page.getByRole('log');
  await expect(answer.getByText(/Rules answer|GEMINI/)).toBeVisible({ timeout: 15000 });
  await expect(answer.getByRole('link', { name: /Cleaner indoor air/ })).toBeVisible();
});

test('supports keyboard dismissal, Hindi quick tips, and mobile layout', async ({ page }) => {
  await fixture(page);
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  const city = page.getByRole('button', { name: 'New Delhi, India' });
  await city.click();
  await expect(page.getByLabel('City or neighbourhood')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(city).toBeFocused();
  await page.getByRole('button', { name: 'Toggle Hindi quick tips' }).click();
  await expect(page.getByText('बाहर की गतिविधि से पहले स्थानीय वायु गुणवत्ता फिर जाँचें।')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= (window.visualViewport?.width ?? window.innerWidth) + 1)).toBe(true);
  const weatherFits = await page.evaluate(() => Array.from(document.querySelectorAll('.weather-grid span')).every(el => el.scrollWidth <= el.clientWidth + 1));
  expect(weatherFits).toBe(true);
});

test('keeps planner full-width, wraps mobile nav, and clears footer above floating CTA', async ({ page }, testInfo) => {
  await fixture(page);
  await page.route('**/api/places?q=110001', route => route.fulfill({ json: { places: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'New Delhi, India' }).click();
  await page.getByLabel('City or neighbourhood').fill('110001');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText(/PIN code lookup is unavailable/)).toBeVisible();
  await page.keyboard.press('Escape');

  await nav(page, 'Daily planner').click();
  const cardWidth = await page.locator('.section-grid > section').first().evaluate(el => el.getBoundingClientRect().width);
  const gridWidth = await page.locator('.section-grid').first().evaluate(el => el.getBoundingClientRect().width);
  if (testInfo.project.name.includes('Mobile')) {
    expect(cardWidth).toBeGreaterThan(gridWidth * 0.95);
    const navClipped = await page.evaluate(() => Array.from(document.querySelectorAll('.navigation a')).some(el => el.getBoundingClientRect().right > window.innerWidth + 1));
    expect(navClipped).toBe(false);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const overlap = await page.evaluate(() => {
      const fab = document.querySelector('.mobile-ask')?.getBoundingClientRect();
      const footer = document.querySelector('.footer')?.getBoundingClientRect();
      return Boolean(fab && footer && footer.bottom > fab.top && footer.right > fab.left);
    });
    expect(overlap).toBe(false);
  } else {
    expect(cardWidth).toBeGreaterThan(gridWidth * 0.45);
  }
});

test('passes automated accessibility checks on each page and the location dialog', async ({ page }) => {
  await fixture(page);
  await page.goto('/');
  await gotForecast(page);
  for (const label of ['Today', 'Daily planner', 'Indoor air', 'Impact simulator', 'Ask SaansAI']) {
    await nav(page, label).click();
    const results = await new AxeBuilder({ page }).withTags(accessibilityTags).analyze();
    expect(results.violations.map(item => [item.id, item.nodes.map(node => node.target)]), label).toEqual([]);
  }
  await page.getByRole('button', { name: CITIES[0].name + ', India' }).click();
  const results = await new AxeBuilder({ page }).withTags(accessibilityTags).analyze();
  expect(results.violations.map(item => item.id)).toEqual([]);
});

test('communicates a cold start and recovers without replacing household choices', async ({ page }) => {
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  let started = false;
  await page.route('**/api/environment?*', async route => {
    started = true;
    await waiting;
    await route.fulfill({ json: modeled(currentTime()) });
  });
  await page.clock.install();
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => started).toBe(true);
  await page.clock.fastForward(3000);
  await expect(page.getByText(/Still connecting to the air data service/)).toBeVisible();
  await page.getByRole('link', { name: 'Personalise my plan' }).click();
  await page.getByLabel('Household budget').selectOption('low');
  await nav(page, 'Today').click();
  release();
  await expect(page.getByText('Current model', { exact: true })).toBeVisible();
  await expect(page.getByText(/Still connecting to the air data service/)).toHaveCount(0);
  await nav(page, 'Daily planner').click();
  await expect(page.getByLabel('Household budget')).toHaveValue('low');
});
