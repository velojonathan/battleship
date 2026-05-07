import type { ShipId } from '../game/types';

/**
 * Hand-authored SVG silhouettes for the five ship classes. Drawn at a 1:1
 * cell aspect (vertical viewBox = length * 32). Used in the ShipDock and
 * FleetStatus panels. Pure SVG, no images. No copyrighted assets.
 */
export interface ShipSvgProps {
  shipId: ShipId;
  length: number;
  /** Visual state — affects fill colors. */
  state?: 'pending' | 'placed' | 'damaged' | 'sunk';
  className?: string;
  /** Width override; height is computed from length. */
  width?: number;
}

const COLORS: Record<NonNullable<ShipSvgProps['state']>, { hull: string; deck: string; trim: string }> = {
  pending: {
    hull: 'rgba(127, 220, 224, 0.18)',
    deck: 'rgba(127, 220, 224, 0.10)',
    trim: 'rgba(127, 220, 224, 0.45)',
  },
  placed: {
    hull: 'rgba(127, 220, 224, 0.55)',
    deck: 'rgba(193, 245, 250, 0.85)',
    trim: 'rgba(193, 245, 250, 0.95)',
  },
  damaged: {
    hull: 'rgba(255, 138, 76, 0.55)',
    deck: 'rgba(255, 200, 140, 0.85)',
    trim: 'rgba(255, 220, 180, 0.95)',
  },
  sunk: {
    hull: 'rgba(120, 35, 35, 0.7)',
    deck: 'rgba(180, 70, 70, 0.7)',
    trim: 'rgba(255, 150, 150, 0.6)',
  },
};

export function ShipSvg({
  shipId,
  length,
  state = 'pending',
  className,
  width = 28,
}: ShipSvgProps): JSX.Element {
  const cell = 32;
  const colors = COLORS[state];
  const totalH = length * cell;
  const svgHeight = (width * totalH) / cell;

  // Each ship is drawn vertically: bow at top, stern at bottom.
  // We use simple geometry per class for a recognizable silhouette.
  return (
    <svg
      viewBox={`0 0 ${cell} ${totalH}`}
      width={width}
      height={svgHeight}
      className={className}
      aria-hidden="true"
      role="presentation"
    >
      {renderShip(shipId, cell, totalH, colors)}
    </svg>
  );
}

function renderShip(
  shipId: ShipId,
  cell: number,
  totalH: number,
  c: { hull: string; deck: string; trim: string },
): JSX.Element {
  const cx = cell / 2;
  const bowR = cell * 0.42;
  const sternR = cell * 0.34;

  // Generic ship hull: rounded bow at top, square stern at bottom, side trim.
  const hull = (
    <>
      <path
        d={`M ${cx - bowR} ${bowR}
            Q ${cx} 0 ${cx + bowR} ${bowR}
            L ${cx + sternR} ${totalH - 2}
            Q ${cx} ${totalH} ${cx - sternR} ${totalH - 2}
            Z`}
        fill={c.hull}
        stroke={c.trim}
        strokeWidth="0.8"
      />
    </>
  );

  // Ship-specific deck details.
  const detailsByShip: Record<ShipId, JSX.Element> = {
    carrier: (
      // Flat aircraft carrier deck: full-length lozenge
      <>
        <rect
          x={cx - cell * 0.28}
          y={cell * 0.7}
          width={cell * 0.56}
          height={totalH - cell * 1.4}
          rx="2"
          fill={c.deck}
          opacity="0.85"
        />
        <line
          x1={cx}
          y1={cell * 0.85}
          x2={cx}
          y2={totalH - cell * 0.85}
          stroke={c.trim}
          strokeWidth="0.6"
          strokeDasharray="2 3"
        />
        <rect
          x={cx + cell * 0.05}
          y={cell * 1.5}
          width={cell * 0.18}
          height={cell * 0.5}
          fill={c.trim}
          opacity="0.8"
        />
      </>
    ),
    battleship: (
      <>
        <rect
          x={cx - cell * 0.18}
          y={cell * 0.85}
          width={cell * 0.36}
          height={cell * 0.7}
          fill={c.deck}
          rx="1.5"
        />
        <rect
          x={cx - cell * 0.16}
          y={cell * 2}
          width={cell * 0.32}
          height={cell * 0.55}
          fill={c.deck}
          rx="1.5"
        />
        <circle cx={cx} cy={cell * 0.55} r={cell * 0.06} fill={c.trim} />
        <circle cx={cx} cy={totalH - cell * 0.5} r={cell * 0.06} fill={c.trim} />
      </>
    ),
    cruiser: (
      <>
        <rect
          x={cx - cell * 0.16}
          y={cell * 0.85}
          width={cell * 0.32}
          height={cell * 0.85}
          fill={c.deck}
          rx="1.5"
        />
        <rect
          x={cx - cell * 0.06}
          y={cell * 1.0}
          width={cell * 0.12}
          height={cell * 0.45}
          fill={c.trim}
        />
        <circle cx={cx} cy={totalH - cell * 0.55} r={cell * 0.07} fill={c.trim} />
      </>
    ),
    submarine: (
      <>
        <rect
          x={cx - cell * 0.12}
          y={cell * 1.0}
          width={cell * 0.24}
          height={cell * 0.55}
          fill={c.deck}
          rx="2"
        />
        <line
          x1={cx}
          y1={cell * 0.9}
          x2={cx}
          y2={totalH - cell * 0.6}
          stroke={c.trim}
          strokeWidth="0.6"
          opacity="0.7"
        />
      </>
    ),
    destroyer: (
      <>
        <rect
          x={cx - cell * 0.16}
          y={cell * 0.7}
          width={cell * 0.32}
          height={cell * 0.55}
          fill={c.deck}
          rx="1.5"
        />
        <circle cx={cx} cy={totalH - cell * 0.6} r={cell * 0.08} fill={c.trim} />
      </>
    ),
  };

  return (
    <>
      {hull}
      {detailsByShip[shipId]}
    </>
  );
}
