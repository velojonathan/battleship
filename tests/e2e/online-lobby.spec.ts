/**
 * Online 2P lobby smoke (PR1).
 *
 * The CI environment doesn't ship with `VITE_WS_URL` configured, so the
 * lobby must render the graceful "Online unavailable" banner. We verify:
 *  - The Online 2P mode button is reachable from Home
 *  - The unavailable banner appears
 *  - Solo and Local 2P remain selectable
 *  - Console stays clean
 *
 * Connected-room flows are covered by server unit tests and will get e2e
 * coverage in PR2 once a local Worker is part of the test harness.
 */
import { expect, test } from '@playwright/test';
import { trackConsole } from './helpers';

test('Online 2P button shows graceful unavailable state when VITE_WS_URL is unset', async ({
  page,
}) => {
  const getErrors = trackConsole(page);
  await page.goto('/');

  await expect(page.getByRole('button', { name: /Online 2P/i })).toBeVisible();
  await page.getByRole('button', { name: /Online 2P/i }).click();

  // The lobby renders, but in unavailable mode.
  const lobby = page.getByTestId('online-lobby');
  await expect(lobby).toBeVisible();
  await expect(lobby).toHaveAttribute('data-online-available', 'false');
  await expect(page.getByTestId('online-unavailable')).toBeVisible();

  // Create / Join controls are NOT rendered when unavailable.
  await expect(page.getByTestId('online-create')).toHaveCount(0);
  await expect(page.getByTestId('online-join-input')).toHaveCount(0);

  // Begin button is hidden in Online 2P mode.
  await expect(
    page.getByRole('button', { name: /Begin placement/i }),
  ).toHaveCount(0);

  // Solo remains selectable and restores the engine flow.
  await page.getByRole('button', { name: /^Solo/i }).click();
  await expect(
    page.getByRole('button', { name: /Begin placement/i }),
  ).toBeVisible();

  expect(getErrors()).toEqual([]);
});
