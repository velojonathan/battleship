import type { Page, ConsoleMessage } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Attach console + pageerror listeners and return a getter for the collected
 * "real" errors. Filters out:
 *  - DevTools-injected log noise
 *  - Vite HMR notices (only present in dev mode; we run against `preview`)
 *  - 404 favicon-style noise
 *
 * Any actual console.error or uncaught page error makes the test fail.
 */
export function trackConsole(page: Page): () => string[] {
  const errors: string[] = [];

  const onConsole = (msg: ConsoleMessage): void => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // Filter out network 404s for assets we don't care about during smoke tests.
    if (/Failed to load resource/i.test(text)) return;
    errors.push(`[console.error] ${text}`);
  };

  const onPageError = (err: Error): void => {
    errors.push(`[pageerror] ${err.message}`);
  };

  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  return () => errors;
}

/**
 * Click the "Begin" button on the home screen.
 */
export async function clickBegin(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Begin placement' }).click();
}

/**
 * From the placement screen, click "Randomize" then "Begin battle" / "ready".
 *
 * `startLabel` is configurable because the start button is labelled
 * differently for solo ("Begin battle") vs. local-2p ("Player 1 ready" / "Player 2 ready").
 */
export async function randomizeAndStart(page: Page, startLabel: string): Promise<void> {
  await page.getByRole('button', { name: 'Randomize fleet' }).click();
  // After randomize, all ships are placed; the start button is enabled.
  const startBtn = page.getByRole('button', { name: startLabel });
  await expect(startBtn).toBeEnabled();
  await startBtn.click();
}

/**
 * Confirm the next window.confirm() dialog (e.g. for QuitButton).
 */
export function autoAcceptDialogs(page: Page): void {
  page.on('dialog', (dialog) => void dialog.accept());
}

/**
 * Find and click the first targetable cell on the targeting board.
 *
 * Returns the data-coord of the cell that was clicked, so the test can
 * assert about its post-fire state.
 */
export async function fireFirstTarget(page: Page): Promise<string> {
  const targetingBoard = page.getByRole('grid', { name: /Fire targeting board/i });
  await expect(targetingBoard).toBeVisible();
  const firstCell = targetingBoard.locator('button[data-coord]').first();
  const coord = await firstCell.getAttribute('data-coord');
  await firstCell.click();
  if (!coord) throw new Error('No data-coord on first targeting cell');
  return coord;
}
