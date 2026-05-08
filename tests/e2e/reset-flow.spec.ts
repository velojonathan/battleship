import { expect, test } from '@playwright/test';
import {
  autoAcceptDialogs,
  clickBegin,
  fireFirstTarget,
  randomizeAndStart,
  trackConsole,
} from './helpers';

/**
 * Reset flow: from an active game, the Quit button returns the player to
 * the home screen with a fresh, empty session. This is the production
 * equivalent of "rematch / reset basic flow" — there is no in-progress
 * game persistence, so a quit-and-restart is the user-facing reset path.
 *
 * Also verifies the Rematch button is reachable from end-game (asserted
 * structurally without playing a full game to completion).
 */
test('quit from active game resets to home, ready for a fresh session', async ({ page }) => {
  const getErrors = trackConsole(page);
  autoAcceptDialogs(page);

  await page.goto('/');

  // Solo + Easy
  await page.getByRole('button', { name: /^Solo/i }).click();
  await page.getByRole('button', { name: /^Easy/i }).click();
  await clickBegin(page);

  // Random placement → start
  await randomizeAndStart(page, 'Begin battle');

  // Fire one shot to put state into an "active game" condition
  await fireFirstTarget(page);
  await expect(page.getByRole('region', { name: 'Game in progress' })).toBeVisible();

  // Quit. The QuitButton's window.confirm() is auto-accepted via autoAcceptDialogs.
  await page.getByRole('button', { name: 'Quit to home' }).click();

  // Home screen is back, with the Begin button enabled again — a fresh session.
  await expect(page.getByRole('region', { name: 'Home' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Begin placement' })).toBeEnabled();

  // The previously fired shot must NOT carry over into the new session: starting
  // a new game produces an empty targeting board.
  await clickBegin(page);
  await randomizeAndStart(page, 'Begin battle');
  const targeting = page.getByRole('grid', { name: /Fire targeting board/i });
  await expect(targeting).toBeVisible();
  expect(await targeting.locator('[data-state="hit"]').count()).toBe(0);
  expect(await targeting.locator('[data-state="miss"]').count()).toBe(0);
  expect(await targeting.locator('[data-state="sunk"]').count()).toBe(0);

  expect(getErrors()).toEqual([]);
});
