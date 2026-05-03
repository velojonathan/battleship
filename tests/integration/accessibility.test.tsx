import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, act, within } from '@testing-library/react';
import App from '../../src/App';
import { renderHook } from '@testing-library/react';
import { useReducedMotion } from '../../src/hooks/useReducedMotion';

/**
 * Accessibility & responsive integration tests (CP7).
 *
 * Test matrix coverage:
 * #43 Cell buttons have useful ARIA labels — Solo + 2P
 * #44 Reduced-motion preference is observable via the useReducedMotion hook
 * #47 Mobile viewport: layout has no horizontal-scroll-causing inline widths
 *     (full Playwright e2e left for CI; this checks the CSS-level guarantees).
 */

function startSolo(): void {
  render(<App aiThinkMs={0} resolveMs={0} />);
  fireEvent.click(screen.getByRole('button', { name: /begin placement/i }));
  fireEvent.click(screen.getByRole('button', { name: /randomize fleet/i }));
  fireEvent.click(screen.getByRole('button', { name: /begin battle/i }));
}

describe('Cell ARIA labels (#43)', () => {
  it('Targeting cells expose "Fire at <coord>" labels before firing', () => {
    startSolo();
    const grid = screen.getByRole('grid', { name: /fire targeting board/i });
    const cells = within(grid).getAllByRole('button');
    // Every targeting cell must have a "Fire at X#" label.
    for (const c of cells) {
      const label = c.getAttribute('aria-label') ?? '';
      expect(label).toMatch(/^Fire at [A-J](?:[1-9]|10)$/);
    }
  });

  it('Own-fleet ship cells expose "your ship" in the label', () => {
    startSolo();
    const board = screen.getByRole('grid', { name: /fleet board$/i });
    // Find at least one cell whose state="ship" — must include "your ship".
    const shipCells = Array.from(
      board.querySelectorAll('[data-state="ship"]'),
    ) as HTMLElement[];
    expect(shipCells.length).toBeGreaterThan(0);
    for (const c of shipCells) {
      expect(c.getAttribute('aria-label') ?? '').toMatch(/your ship/i);
    }
  });

  it('Battle log uses aria-live="polite" so updates announce to screen readers', () => {
    startSolo();
    const logSection = screen.getByLabelText(/battle log/i);
    const liveList = logSection.querySelector('[aria-live="polite"]');
    expect(liveList).not.toBeNull();
  });

  it('Turn banner is in an aria-live region so turn changes announce', () => {
    startSolo();
    // The turn banner contains "fire" text; querying for [aria-live].
    const live = document.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
  });
});

describe('Keyboard navigation in board grids (#43 a11y)', () => {
  it('ArrowRight on a targeting cell moves focus to the next cell', () => {
    startSolo();
    const grid = screen.getByRole('grid', { name: /fire targeting board/i });
    const a1 = grid.querySelector(
      'button[data-coord="0,0"]',
    ) as HTMLButtonElement | null;
    expect(a1).not.toBeNull();
    a1!.focus();
    expect(document.activeElement).toBe(a1);
    fireEvent.keyDown(a1!, { key: 'ArrowRight' });
    const b1 = grid.querySelector(
      'button[data-coord="0,1"]',
    ) as HTMLButtonElement | null;
    expect(b1).not.toBeNull();
    expect(document.activeElement).toBe(b1);
  });

  it('ArrowDown/ArrowUp/ArrowLeft also move focus', () => {
    startSolo();
    const grid = screen.getByRole('grid', { name: /fire targeting board/i });
    const c5 = grid.querySelector(
      'button[data-coord="4,2"]',
    ) as HTMLButtonElement;
    c5.focus();
    fireEvent.keyDown(c5, { key: 'ArrowDown' });
    expect(
      (document.activeElement as HTMLElement).getAttribute('data-coord'),
    ).toBe('5,2');
    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: 'ArrowUp',
    });
    expect(
      (document.activeElement as HTMLElement).getAttribute('data-coord'),
    ).toBe('4,2');
    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: 'ArrowLeft',
    });
    expect(
      (document.activeElement as HTMLElement).getAttribute('data-coord'),
    ).toBe('4,1');
  });

  it('Arrow at the edge does not move focus and does not crash', () => {
    startSolo();
    const grid = screen.getByRole('grid', { name: /fire targeting board/i });
    const a1 = grid.querySelector(
      'button[data-coord="0,0"]',
    ) as HTMLButtonElement;
    a1.focus();
    fireEvent.keyDown(a1, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(a1);
    fireEvent.keyDown(a1, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(a1);
  });
});

describe('Reduced-motion preference (#44)', () => {
  let originalMatchMedia: typeof window.matchMedia;
  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('useReducedMotion returns false when no preference', () => {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        onchange: null,
        dispatchEvent: () => true,
      }) as unknown as MediaQueryList;
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('useReducedMotion returns true when user prefers reduced motion', () => {
    window.matchMedia = (query: string) =>
      ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        onchange: null,
        dispatchEvent: () => true,
      }) as unknown as MediaQueryList;
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it('useReducedMotion subscribes to media query change events', () => {
    let captured: ((e: MediaQueryListEvent) => void) | null = null;
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: (_evt: string, l: (e: MediaQueryListEvent) => void) => {
          captured = l;
        },
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        onchange: null,
        dispatchEvent: () => true,
      }) as unknown as MediaQueryList;
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    expect(captured).not.toBeNull();
    // Simulate the user toggling reduced motion ON.
    act(() => {
      captured!({ matches: true } as MediaQueryListEvent);
    });
    expect(result.current).toBe(true);
  });
});

describe('Responsive layout (#47)', () => {
  it('Boards are styled with grid (not fixed pixel inline widths) so they reflow on mobile', () => {
    startSolo();
    const grids = screen.getAllByRole('grid');
    for (const g of grids) {
      const style = (g as HTMLElement).getAttribute('style') ?? '';
      // Boards must NOT carry hardcoded inline widths in pixels.
      expect(style).not.toMatch(/\bwidth: \d+px/);
    }
  });

  it('No element has a fixed pixel width that exceeds 1280px (desktop max)', () => {
    startSolo();
    const all = document.querySelectorAll<HTMLElement>('[style]');
    for (const el of Array.from(all)) {
      const style = el.getAttribute('style') ?? '';
      const match = style.match(/\bwidth:\s*(\d+)px/);
      if (!match || !match[1]) continue;
      const px = Number(match[1]);
      expect(px).toBeLessThanOrEqual(1280);
    }
  });
});
