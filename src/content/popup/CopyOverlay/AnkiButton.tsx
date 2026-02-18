import { useCallback, useState } from 'preact/hooks';

import type { AnkiNote } from '../../../common/anki-types';
import { useLocale } from '../../../common/i18n';
import { classes } from '../../../utils/classes';

export type AnkiAddState = 'idle' | 'adding' | 'added' | 'error';

type Props = {
  note: AnkiNote | null;
  onAddToAnki?: (
    note: AnkiNote
  ) => Promise<{ success: boolean; error?: string }>;
};

export function AnkiButton(props: Props) {
  const { note, onAddToAnki } = props;
  const { langTag } = useLocale();
  const [state, setState] = useState<AnkiAddState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleClick = useCallback(async () => {
    if (!note || !onAddToAnki || state === 'adding' || state === 'added') {
      return;
    }

    setState('adding');
    setErrorMsg(null);

    try {
      const result = await onAddToAnki(note);
      if (result.success) {
        setState('added');
        // Reset after a short delay
        setTimeout(() => setState('idle'), 2000);
      } else {
        setState('error');
        setErrorMsg(result.error || 'Unknown error');
        setTimeout(() => setState('idle'), 3000);
      }
    } catch (e) {
      setState('error');
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setTimeout(() => setState('idle'), 3000);
    }
  }, [note, onAddToAnki, state]);

  if (!note) {
    return null;
  }

  const buttonLabel = (() => {
    switch (state) {
      case 'adding':
        return 'Adding...';
      case 'added':
        return 'Added \u2713';
      case 'error':
        return errorMsg ? `Error: ${errorMsg}` : 'Error';
      default:
        return 'Add to Anki';
    }
  })();

  const buttonColors = (() => {
    switch (state) {
      case 'adding':
        return 'tp:bg-blue-100 tp:text-blue-700 tp:border-blue-300';
      case 'added':
        return 'tp:bg-green-100 tp:text-green-700 tp:border-green-300';
      case 'error':
        return 'tp:bg-red-100 tp:text-red-700 tp:border-red-300';
      default:
        return 'tp:bg-indigo-50 tp:text-indigo-700 tp:border-indigo-200 tp:hover:bg-indigo-100';
    }
  })();

  return (
    <li class="tp:list-none">
      <button
        type="button"
        class={classes(
          'tp:appearance-none tp:w-full',
          'tp:px-5 tp:py-3 tp:rounded-lg',
          'tp:border tp:border-solid',
          'tp:flex tp:items-center tp:gap-2.5',
          'tp:text-sm tp:font-medium tp:leading-normal',
          'tp:cursor-pointer tp:transition-colors',
          'tp:truncate',
          buttonColors,
          (state === 'adding' || state === 'added') && 'tp:cursor-default'
        )}
        lang={langTag}
        onClick={handleClick}
        disabled={state === 'adding' || state === 'added'}
      >
        <AnkiIcon state={state} />
        <span class="tp:truncate">{buttonLabel}</span>
      </button>
    </li>
  );
}

function AnkiIcon({ state }: { state: AnkiAddState }) {
  if (state === 'added') {
    return (
      <svg
        viewBox="0 0 24 24"
        class="tp:size-5 tp:shrink-0"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M20 6L9 17l-5-5" />
      </svg>
    );
  }

  if (state === 'adding') {
    return (
      <svg viewBox="0 0 24 24" class="tp:size-5 tp:shrink-0 tp:animate-spin">
        <circle
          cx="12"
          cy="12"
          r="10"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          opacity="0.3"
        />
        <path
          d="M12 2a10 10 0 0 1 10 10"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        />
      </svg>
    );
  }

  if (state === 'error') {
    return (
      <svg
        viewBox="0 0 24 24"
        class="tp:size-5 tp:shrink-0"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    );
  }

  // Default: Anki-style add icon (card with +)
  return (
    <svg
      viewBox="0 0 24 24"
      class="tp:size-5 tp:shrink-0"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" ry="2" />
      <line x1="12" y1="9" x2="12" y2="15" />
      <line x1="9" y1="12" x2="15" y2="12" />
    </svg>
  );
}
