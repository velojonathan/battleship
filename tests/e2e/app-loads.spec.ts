import { expect, test } from '@playwright/test';
import { trackConsole } from './helpers';

test('app loads home screen with Battleship branding', async ({ page }) => {
  const getErrors = trackConsole(page);

  await page.goto('/');

  // Document title (set in index.html)
  await expect(page).toHaveTitle(/Battleship/i);

  // Hero copy
  await expect(page.getByRole('heading', { level: 1, name: 'Battleship' })).toBeVisible();
  await expect(page.getByText(/Sink the enemy fleet/i)).toBeVisible();

  // Mode selector
  await expect(page.getByRole('button', { name: /^Solo/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Local 2P/i })).toBeVisible();

  // Begin button
  await expect(page.getByRole('button', { name: 'Begin placement' })).toBeEnabled();

  expect(getErrors()).toEqual([]);
});
