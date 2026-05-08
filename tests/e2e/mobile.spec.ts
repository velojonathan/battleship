import { expect, test } from '@playwright/test';
import { clickBegin, trackConsole } from './helpers';

/**
 * Mobile viewport smoke test.
 *
 * Runs against the Pixel 7 device profile (configured in playwright.config.ts).
 * Verifies the app loads, key controls are visible at narrow widths, and the
 * page never develops horizontal scroll — a regression we caught manually
 * during CP8 (rotating sonar overlay overflowing) and want to keep nailed
 * down across the home + placement screens.
 *
 * The full game flow is covered by solo-flow.spec.ts on desktop. On mobile
 * we only smoke-test the layout-critical surfaces; this keeps the suite
 * fast and avoids tap-targeting flakiness on tall, scrolling screens.
 */
test.describe('Mobile smoke', () => {
  test('home and placement screens render without horizontal scroll', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'Mobile-only test; runs under chromium-mobile project.');

    const getErrors = trackConsole(page);

    await page.goto('/');

    // Hero is visible
    await expect(page.getByRole('heading', { level: 1, name: 'Battleship' })).toBeVisible();

    // Begin placement button is reachable on mobile viewport
    await expect(page.getByRole('button', { name: 'Begin placement' })).toBeVisible();

    // No horizontal overflow on the home screen
    const overflowHome = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflowHome).toBeLessThanOrEqual(1); // allow 1px rounding

    // Walk into placement to exercise the narrow-viewport board layout that
    // previously caused horizontal scroll (CP8 fix).
    await page.getByRole('button', { name: /^Solo/i }).click();
    await page.getByRole('button', { name: /^Easy/i }).click();
    await clickBegin(page);
    await expect(page.getByRole('region', { name: /Ship placement/i })).toBeVisible();

    // Randomize so the board has ships rendered (more representative layout).
    await page.getByRole('button', { name: 'Randomize fleet' }).click();

    const overflowPlacement = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflowPlacement).toBeLessThanOrEqual(1);

    expect(getErrors()).toEqual([]);
  });
});
