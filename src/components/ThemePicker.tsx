import { SEASONS, seasonFor, type ThemeChoice } from '../lib/themes';
import Icon from './Icon';

type Props = {
  choice: ThemeChoice;
  onChoose: (choice: ThemeChoice) => void;
  fx: boolean;
  onToggleFx: () => void;
};

export default function ThemePicker({ choice, onChoose, fx, onToggleFx }: Props) {
  const today = SEASONS.find((s) => s.id === seasonFor())!;
  return (
    <div className="theme-picker">
      <div aria-label="Season theme" className="seg" role="radiogroup">
        <button
          aria-checked={choice === 'auto'}
          onClick={() => onChoose('auto')}
          role="radio"
          title={`Follow the calendar (now ${today.label})`}
          type="button"
        >
          Auto
        </button>
        {SEASONS.map((s) => (
          <button
            aria-checked={choice === s.id}
            aria-label={s.label}
            className="kanji"
            key={s.id}
            onClick={() => onChoose(s.id)}
            role="radio"
            title={`${s.label} · ${s.mood}`}
            type="button"
          >
            {s.kanji}
          </button>
        ))}
      </div>
      <button
        aria-label="Seasonal effects"
        aria-pressed={fx}
        className="icon-btn"
        onClick={onToggleFx}
        title={fx ? 'Hide seasonal effects' : 'Show seasonal effects'}
        type="button"
      >
        <Icon name="sparkle" />
      </button>
    </div>
  );
}
