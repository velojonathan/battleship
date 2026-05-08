import styles from './SoundToggle.module.css';

export interface SoundToggleProps {
  muted: boolean;
  available: boolean;
  onToggle: () => void;
}

/**
 * Small accessible mute toggle. Renders an icon-only button with
 * aria-pressed + aria-label, falling back to a disabled state when
 * Web Audio is unavailable in the browser.
 */
export function SoundToggle({
  muted,
  available,
  onToggle,
}: SoundToggleProps): JSX.Element {
  if (!available) {
    return (
      <button
        type="button"
        className={styles.button}
        aria-label="Sound unavailable"
        title="Audio is not available in this browser"
        disabled
        data-testid="sound-toggle"
      >
        <span aria-hidden="true">🔇</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={styles.button}
      aria-pressed={muted}
      aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
      title={muted ? 'Unmute' : 'Mute'}
      onClick={onToggle}
      data-testid="sound-toggle"
      data-muted={muted ? 'true' : 'false'}
    >
      <span aria-hidden="true">{muted ? '🔇' : '🔊'}</span>
    </button>
  );
}
