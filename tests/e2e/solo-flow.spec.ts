import { expect, test } from '@playwright/test';
import { clickBegin, fireFirstTarget, randomizeAndStart, trackConsole } from './helpers';

test.describe('Solo flow', () => {
  test('start solo, randomize placement, fire a shot, no console errors', async ({ page }) => {
    const getErrors = trackConsole(page);

    await page.goto('/');

    // Solo is the default mode; explicitly select it for robustness.
    await page.getByRole('button', { name: /^Solo/i }).click();
    await expect(page.getByRole('button', { name: /^Solo/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Pick Easy difficulty so the AI is fast and predictable.
    await page.getByRole('button', { name: /^Easy/i }).click();

    await clickBegin(page);

    // Placement screen
    await expect(page.getByRole('region', { name: /Ship placement/i })).toBeVisible();

    // Random placement → start
    await randomizeAndStart(page, 'Begin battle');

    // Game in progress
    await expect(page.getByRole('region', { name: 'Game in progress' })).toBeVisible();

    // Targeting board is interactive; fire a shot at the first cell.
    const coord = await fireFirstTarget(page);

    // The cell we just fired at should resolve to hit/miss/sunk within the
    // engine's resolveMs window (700ms in production).
    const targetCell = page
      .getByRole('grid', { name: /Fire targeting board/i })
      .locator(`button[data-coord="${coord}"]`);
    await expect(targetCell).toHaveAttribute('data-state', /^(hit|miss|sunk)$/, {
      timeout: 5_000,
    });

    // No console errors during the flow
    expect(getErrors()).toEqual([]);
  });
});
