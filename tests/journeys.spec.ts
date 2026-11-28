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
  await expect(page.getByRole('status').filter({ hasText: '1 of 4 complete' })).toBeVisible();
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
  const efficiency = page.getByLabel('Petrol vehicle efficiency (km/L)');
  await efficiency.fill('0');
  await expect(efficiency).toHaveAccessibleDescription('Enter a number from 3 to 100.');
  await expect(page.getByText(/Complete each input/)).toBeVisible();
  await page.getByLabel('Current forecast hour').selectOption({ index: 1 });
  await page.getByLabel('Alternative forecast hour').selectOption({ index: 2 });
  await expect(page.getByText('Lower outdoor proxy')).toBeVisible();
  await page.getByLabel('Current outdoor minutes').fill('65');
  await expect(page.getByLabel('Current outdoor minutes')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText(/Enter whole outdoor minutes/)).toBeVisible();
  await page.getByLabel('Current outdoor minutes').fill('25');
  await efficiency.fill('15.25');
  await expect(efficiency).toHaveAttribute('aria-invalid', 'false');
  expect(await efficiency.evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(true);
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
  const cspErrors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error' && message.text().includes('Content Security Policy')) cspErrors.push(message.text());
  });
  await page.goto('/');
  await gotForecast(page);
  for (const [label, section] of [
    ['Today', 'Hourly outlook'],
    ['Daily planner', 'Household settings'],
    ['Indoor air', 'Indoor action by budget'],
    ['Impact simulator', 'Petrol travel comparison'],
    ['Ask SaansAI', 'Your air assistant'],
  ]) {
    await nav(page, label).click();
    await expect(page.getByRole('heading', { name: section, exact: true })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(accessibilityTags).analyze();
    expect(results.violations.map(item => [item.id, item.nodes.map(node => node.target)]), label).toEqual([]);
  }
  await page.getByRole('button', { name: CITIES[0].name + ', India' }).click();
  const results = await new AxeBuilder({ page }).withTags(accessibilityTags).analyze();
  expect(results.violations.map(item => item.id)).toEqual([]);
  expect(cspErrors).toEqual([]);
});

test('keeps the mobile header in place while a secondary view loads', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 823 });
  await fixture(page);
  let finish!: () => void;
  const delay = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/assets/planner-view-*.js', async route => {
    await delay;
    return route.continue();
  });
  try {
    await page.goto('/#planner', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Opening this section…')).toBeVisible();
    const topbar = page.locator('.topbar');
    const position = () => topbar.evaluate(el => el.getBoundingClientRect().top + window.scrollY);
    const loading = await position();
    finish();
    await expect(page.getByRole('heading', { name: 'Household settings' })).toBeVisible();
    expect(Math.abs(await position() - loading)).toBeLessThanOrEqual(1);
  } finally {
    finish();
  }
});

test('communicates a slow air-data request and recovers without replacing household choices', async ({ page }) => {
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

for (const status of [200, 503]) test(`retains the earlier model through a ${status} outage and recovers on retry`, async ({ page }) => {
  let outage = false;
  let requestCount = 0;
  await page.route('**/api/environment?*', async route => {
    requestCount++;
    if (!outage) return route.fulfill({ json: modeled(currentTime()) });
    const json = status === 200 ? { ...EMPTY_ENV, stationStatus: 'unavailable' } : { error: { message: 'Air data is temporarily unavailable.' } };
    return route.fulfill({ status, json });
  });

  await page.goto('/');
  await gotForecast(page);
  await expect(page.locator('.readout strong')).toHaveText('82');
  outage = true;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Showing the last data from this visit' })).toBeVisible();
  await expect(page.getByText('Earlier model', { exact: true })).toBeVisible();
  await expect(page.getByText('Forecast may be stale. Activity planning is paused.')).toBeVisible();
  await expect(page.locator('.readout strong')).toHaveText('82');
  expect(requestCount).toBe(status === 200 ? 2 : 3);

  outage = false;
  await page.getByRole('button', { name: 'Retry live readings' }).click();
  await gotForecast(page);
  await expect(page.getByText('Showing the last data from this visit.', { exact: false })).toHaveCount(0);
});

test('keeps the dashboard usable on malformed air responses and repairs invalid saved checklist data', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('saans:checklist', 'null'));
  await page.route('**/api/environment?*', route => route.fulfill({ json: {
    airStatus: 'fresh', air: { current: { aqi: 82 }, fetchedAt: currentTime() },
  } }));
  await page.goto('/');
  await expect(page.getByRole('status').filter({ hasText: 'The data service returned an invalid response.' })).toBeVisible();
  await expect(page.getByText('No suitable window')).toBeVisible();
  await nav(page, 'Daily planner').press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Plan your day' })).toBeFocused();
  await expect(page.getByRole('status').filter({ hasText: '0 of 4 complete' })).toBeVisible();
  await page.locator('.check-action input').first().check();
  await expect(page.getByRole('status').filter({ hasText: '1 of 4 complete' })).toBeVisible();
});

test('discards location results when the search text changes, even during a request', async ({ page }) => {
  let release!: () => void;
  const delay = new Promise<void>(resolve => { release = resolve; });
  let delayedSearch = false;
  await page.route('**/api/places?*', async route => {
    const term = new URL(route.request().url()).searchParams.get('q');
    if (term === 'Pune') {
      delayedSearch = true;
      await delay;
      return route.fulfill({ json: { places: [{ name: 'Pune', state: 'Maharashtra', lat: 18.52, lon: 73.86 }] } });
    }
    return route.fulfill({ json: { places: [CITIES[2]] } });
  });
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'New Delhi, India' }).click();
    const dialog = page.getByRole('dialog');
    const input = dialog.getByRole('textbox');
    const status = dialog.getByRole('status');
    await input.fill('Pune');
    await input.press('Enter');
    await expect(status).toHaveText('Searching Indian cities…');
    await expect.poll(() => delayedSearch).toBe(true);
    await input.fill('Bengaluru');
    await expect(status).toBeEmpty();
    await input.press('Enter');
    await expect(status).toHaveText('1 matching city found.');
    release();
    await page.unrouteAll({ behavior: 'wait' });
    await expect(dialog.getByRole('button', { name: 'Bengaluru Karnataka' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Pune Maharashtra' })).toHaveCount(0);
    await input.fill('Lucknow');
    await expect(status).toBeEmpty();
    await expect(dialog.getByText('SUGGESTED CITIES')).toBeVisible();
  } finally {
    release();
  }
});

test('keeps earlier readings out of a newly selected city even when the previous request finishes late', async ({ page }) => {
  let finishRefresh!: () => void;
  const delayedRefresh = new Promise<void>(resolve => { finishRefresh = resolve; });
  let refreshStarted = false;
  let originalRequests = 0;
  const [original, next] = CITIES;
  await page.route('**/api/environment?*', async route => {
    const lat = new URL(route.request().url()).searchParams.get('lat');
    if (lat === String(next.lat)) {
      await route.fulfill({ json: EMPTY_ENV });
      return;
    }
    if (++originalRequests > 1) {
      refreshStarted = true;
      await delayedRefresh;
    }
    await route.fulfill({ json: modeled(currentTime()) });
  });

  try {
    await page.goto('/');
    await gotForecast(page);
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect.poll(() => refreshStarted).toBe(true);
    await page.getByRole('button', { name: original.name + ', India' }).click();
    await page.getByRole('dialog').getByRole('button', { name: new RegExp(next.name) }).click();
    await expect(page.getByRole('button', { name: next.name + ', India' })).toBeVisible();
    await expect(page.getByText('Feed unavailable')).toBeVisible();

    finishRefresh();
    await page.unrouteAll({ behavior: 'wait' });
    await expect(page.getByText('Feed unavailable')).toBeVisible();
    await expect(page.getByText('Current model', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Earlier model', { exact: true })).toHaveCount(0);
  } finally {
    finishRefresh();
  }
});

test('makes the expanded forecast table keyboard-scrollable at 320 CSS pixels', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await fixture(page);
  await page.goto('/');
  await gotForecast(page);
  const disclosure = page.getByText('View forecast as a table', { exact: true });
  await disclosure.press('Enter');
  const region = page.getByRole('region', { name: 'Hourly forecast table' });
  await expect(region.getByRole('table', { name: 'Hourly forecast in IST' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(region).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => region.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);

  const results = await new AxeBuilder({ page }).withTags(accessibilityTags).analyze();
  expect(results.violations.map(item => [item.id, item.nodes.map(node => node.target)])).toEqual([]);
});

test('restores keyboard focus on cancel and accepts a new assistant question', async ({ page }) => {
  await fixture(page);
  const questions: string[] = [];
  let finishFirst!: () => void;
  const pending = new Promise<void>(resolve => { finishFirst = resolve; });
  await page.route('**/api/ask', async route => {
    const { question } = route.request().postDataJSON() as { question: string };
    questions.push(question);
    if (questions.length === 1) {
      await pending;
      await route.abort();
    } else {
      await route.fulfill({ status: 429, json: { error: { message: 'Try again later.' } } });
    }
  });

  try {
    await page.goto('/#assistant');
    const input = page.getByRole('textbox', { name: 'Your question' });
    await page.getByRole('button', { name: 'Should I open the windows?' }).click();
    await expect.poll(() => questions.length).toBe(1);
    await expect(input).toBeFocused();
    await expect(page.getByRole('status').filter({ hasText: 'Checking your context' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel question' }).press('Enter');
    await expect(input).toHaveValue('Should I open the windows?');
    await expect(input).toBeFocused();

    await input.fill('How should I adjust my commute?');
    await input.press('Enter');
    const log = page.getByRole('log', { name: 'Assistant responses' });
    await expect(log).toContainText('Gemini quota reached · Rules answer');
    await expect(log).toContainText('How should I adjust my commute?');
    await expect(log).not.toContainText('Should I open the windows?');
    expect(questions).toEqual(['Should I open the windows?', 'How should I adjust my commute?']);
  } finally {
    finishFirst();
  }
});
