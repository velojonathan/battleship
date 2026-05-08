import { expect, test } from '@playwright/test';
import { autoAcceptDialogs, clickBegin, randomizeAndStart, trackConsole } from './helpers';

/**
 * Responsive smoke across the 7 reference viewports from the FP1 spec.
 *
 * For each width we boot the home screen, walk into placement, randomize,
 * start the battle, and fire one shot. At every step we assert that the
 * page has no horizontal overflow (a common regression on Chrome/Mac
 * laptops at 1024+ when the sidebar grew taller than the boards).
 *
 * Runs only under chromium-desktop (the mobile project covers Pixel 7).
 */

const VIEWPORTS = [
  { width: 320, height: 720, label: '320 narrow phone' },
  { width: 360, height: 760, label: '360 small phone' },
  { width: 390, height: 844, label: '390 iPhone 14' },
  { width: 412, height: 915, label: '412 large phone' },
  { width: 768, height: 1024, label: '768 tablet' },
  { width: 1024, height: 768, label: '1024 small laptop' },
  { width: 1440, height: 900, label: '1440 14"/16" laptop' },
];

async function expectNoHorizontalOverflow(
  page: import('@playwright/test').Page,
  contextLabel: string,
): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  // Allow 1px rounding error.
  expect(overflow, `horizontal overflow on ${contextLabel}`).toBeLessThanOrEqual(1);
}

for (const vp of VIEWPORTS) {
  test.describe(`Responsive ${vp.label} (${vp.width}px)`, () => {
    test('home, placement, and active game render without horizontal overflow', async ({
      page,
      isMobile,
    }) => {
      // The mobile.spec.ts project handles its own (Pixel 7) viewport.
      // This spec is for the desktop project; skip if accidentally picked up.
      test.skip(isMobile, 'Desktop-project spec; mobile project covers Pixel 7.');

      await page.setViewportSize({ width: vp.width, height: vp.height });
      const getErrors = trackConsole(page);
      autoAcceptDialogs(page);

      await page.goto('/');
      await expect(
        page.getByRole('heading', { level: 1, name: 'Battleship' }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page, `${vp.label} home`);

      // Walk into placement (Solo, Easy).
      await page.getByRole('button', { name: /^Solo/i }).click();
      await page.getByRole('button', { name: /^Easy/i }).click();
      await clickBegin(page);
      await expect(
        page.getByRole('region', { name: /Ship placement/i }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page, `${vp.label} placement`);

      // Randomize and start the battle, then verify in-progress + post-fire.
      // Covers the narrow widths (320/360) too, which previously slipped past
      // the e2e suite and let the in-game scoreboard overflow on a 320px phone.
      await randomizeAndStart(page, 'Begin battle');
      await expect(
        page.getByRole('grid', { name: /Fire targeting board/i }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page, `${vp.label} in-progress`);

      // Fire one shot to exercise the post-shot layout.
      const targeting = page.getByRole('grid', { name: /Fire targeting board/i });
      await targeting.locator('button[data-coord]').first().click();
      await expectNoHorizontalOverflow(page, `${vp.label} post-fire`);

      // Console must be clean across the run.
      expect(getErrors()).toEqual([]);
    });
  });
}
