import { expect, test } from '@playwright/test';
import { clickBegin, randomizeAndStart, trackConsole } from './helpers';

/**
 * Local 2P pass-and-play flow.
 *
 * Verifies:
 *   - Local 2P starts → P1 placement
 *   - Pre-battle handoff to P2 exists, with P1's ships not in the DOM
 *   - P2 placement
 *   - Pre-battle handoff back to P1, with NEITHER player's ships in the DOM
 *   - P1's turn renders the targeting board
 *
 * Privacy assertion: while a HandoffScreen is mounted, no `data-state="ship"`
 * cells should exist anywhere in the DOM. Both PlacementScreen (which would
 * show the inactive player's ships) and GameScreen (which would show the
 * inactive player's "Your fleet") are unmounted by App during handoff.
 */
test('local 2P handoff hides inactive player ships from the DOM', async ({ page }) => {
  const getErrors = trackConsole(page);

  await page.goto('/');

  // Switch to Local 2P
  await page.getByRole('button', { name: /Local 2P/i }).click();
  await expect(page.getByRole('button', { name: /Local 2P/i })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await clickBegin(page);

  // P1 placement
  const placementRegion = page.getByRole('region', { name: /Ship placement/i });
  await expect(placementRegion).toBeVisible();
  await expect(page.getByText(/Place your fleet/i).first()).toBeVisible();

  // P1 randomizes and confirms
  await randomizeAndStart(page, 'Player 1 ready');

  // Pre-place handoff to P2 — P1's ships must not be in the DOM
  const handoffP2 = page.getByRole('dialog', { name: /Handoff to/i });
  await expect(handoffP2).toBeVisible();
  expect(await page.locator('[data-state="ship"]').count()).toBe(0);
  // Placement region must NOT be mounted during handoff
  await expect(placementRegion).toHaveCount(0);

  // P2 confirms handoff → P2 placement screen
  await page.getByRole('button', { name: /Confirm handoff to/i }).click();
  await expect(placementRegion).toBeVisible();

  // P2 randomizes and confirms
  await randomizeAndStart(page, 'Player 2 ready');

  // Pre-battle handoff back to P1 — NEITHER player's ships should be in the DOM
  const handoffP1 = page.getByRole('dialog', { name: /Handoff to/i });
  await expect(handoffP1).toBeVisible();
  expect(await page.locator('[data-state="ship"]').count()).toBe(0);
  // Game region must NOT be mounted during handoff
  await expect(page.getByRole('region', { name: 'Game in progress' })).toHaveCount(0);

  // P1 confirms → first turn
  await page.getByRole('button', { name: /Confirm handoff to/i }).click();
  await expect(page.getByRole('region', { name: 'Game in progress' })).toBeVisible();

  // Sanity: the targeting board (against P2) is visible and has no ship cells
  // visible (only empty / hit / miss / sunk states are allowed there).
  const targeting = page.getByRole('grid', { name: /Fire targeting board/i });
  await expect(targeting).toBeVisible();
  expect(await targeting.locator('[data-state="ship"]').count()).toBe(0);

  // Own board (P1's) MAY contain ship cells visible to the active player.
  // This is correct: the active player's own fleet is visible to them.
  const ownBoard = page.getByRole('grid', { name: /fleet board$/i });
  await expect(ownBoard).toBeVisible();
  expect(await ownBoard.locator('[data-state="ship"]').count()).toBeGreaterThan(0);

  expect(getErrors()).toEqual([]);
});
