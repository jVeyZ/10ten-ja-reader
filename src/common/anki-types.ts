/**
 * Type definitions for AnkiConnect integration.
 *
 * Based on the AnkiConnect API (https://foosoft.net/projects/anki-connect/)
 * and adapted from Yomitan's implementation.
 */

/** A unique identifier for an Anki note. */
export type NoteId = number;

/** A unique identifier for an Anki card. */
export type CardId = number;

/** The field values of an Anki note, keyed by field name. */
export type NoteFields = Record<string, string>;

/** Options for note duplicate handling. */
export interface NoteOptions {
  allowDuplicate: boolean;
  duplicateScope?: 'collection' | 'deck' | 'deck-root';
  duplicateScopeOptions?: {
    deckName?: string;
    checkChildren?: boolean;
    checkAllModels?: boolean;
  };
}

/** An Anki note to be sent to AnkiConnect. */
export interface AnkiNote {
  deckName: string;
  modelName: string;
  fields: NoteFields;
  tags: Array<string>;
  options?: NoteOptions;
}

/** An Anki note with an existing note ID (for updates). */
export interface AnkiNoteWithId extends AnkiNote {
  id: NoteId;
}

/** Information about a field in an existing note. */
export interface NoteFieldInfo {
  value: string;
  order: number;
}

/** Information about an existing note returned by notesInfo. */
export interface NoteInfo {
  noteId: NoteId;
  tags: Array<string>;
  fields: Record<string, NoteFieldInfo>;
  modelName: string;
  cards: Array<CardId>;
}

/** Information about an existing card returned by cardsInfo. */
export interface CardInfo {
  noteId: NoteId;
  cardId: CardId;
  flags: number;
  cardState: number;
}

/** Result of canAddNotesWithErrorDetail. */
export interface CanAddNoteDetail {
  canAdd: boolean;
  error: string | null;
}

/** The JSON body sent to the AnkiConnect API. */
export interface AnkiConnectMessageBody {
  action: string;
  params: Record<string, unknown>;
  version: number;
  key?: string;
}

/** Settings for configuring the AnkiConnect integration. */
export interface AnkiSettings {
  enabled: boolean;
  server: string;
  apiKey: string;
  deckName: string;
  modelName: string;
  tags: Array<string>;
  /** Map of Anki model field names to template values. */
  fieldTemplates: Record<string, string>;
  duplicateScope: 'collection' | 'deck' | 'deck-root';
  checkForDuplicates: boolean;
}

/** Default AnkiConnect settings. */
export const DEFAULT_ANKI_SETTINGS: AnkiSettings = {
  enabled: false,
  server: 'http://127.0.0.1:8765',
  apiKey: '',
  deckName: 'Default',
  modelName: 'Basic',
  tags: ['10ten'],
  fieldTemplates: { Front: '{expression}', Back: '{reading}\n{definition}' },
  duplicateScope: 'collection',
  checkForDuplicates: true,
};

/**
 * Available template markers for field templates.
 *
 * These are compatible with Yomitan's template markers so users can
 * reuse their existing Yomitan card configurations.
 */
export const ANKI_FIELD_MARKERS = [
  // Core
  'expression',
  'reading',
  'reading-romaji',
  'furigana',
  'furigana-plain',
  // Glossary variants
  'glossary',
  'glossary-brief',
  'glossary-plain',
  'glossary-no-dictionary',
  'glossary-plain-no-dictionary',
  'glossary-first',
  'glossary-first-brief',
  'glossary-first-no-dictionary',
  'definition',
  // Grammar
  'part-of-speech',
  'tags-pos',
  'tags',
  'conjugation',
  // Pitch accent
  'pitch-accent-positions',
  'pitch-accent-categories',
  'pitch-accents',
  'pitch-accent-graphs',
  'pitch-accent-graphs-jj',
  // Context
  'sentence',
  'sentence-furigana',
  'sentence-furigana-plain',
  'url',
  'document-title',
  'search-query',
  // Cloze
  'cloze-body',
  'cloze-body-kana',
  'cloze-prefix',
  'cloze-suffix',
  // Media (output empty — not available in 10ten)
  'audio',
  'screenshot',
  'clipboard-image',
  'clipboard-text',
  'popup-selection-text',
  // Frequency (output empty — not available in 10ten)
  'frequencies',
  'frequency-harmonic-rank',
  'frequency-harmonic-occurrence',
  'frequency-average-rank',
  'frequency-average-occurrence',
  // Phonetic
  'phonetic-transcriptions',
  // Dictionary info
  'dictionary',
  'dictionary-alias',
  // Kanji-specific
  'character',
  'onyomi',
  'kunyomi',
  'stroke-count',
] as const;

export type AnkiFieldMarker = (typeof ANKI_FIELD_MARKERS)[number];
