/**
 * Builds Anki notes from 10ten-ja-reader dictionary entries.
 *
 * Supports Yomitan-compatible field markers so users can reuse their
 * existing Yomitan Anki card templates without modification.
 */
import type { KanjiResult } from '@birchill/jpdict-idb';

import { deinflectL10NKeys } from '../background/deinflect';
import type {
  NameResult,
  Sense,
  WordResult,
} from '../background/search-result';
import type { AnkiNote, AnkiSettings, NoteFields } from '../common/anki-types';

import type { CopyEntry } from './copy-text';

/**
 * Context information about where the word was looked up.
 */
export interface AnkiNoteContext {
  /** The URL of the page where the word was looked up. */
  url?: string;
  /** The title of the page. */
  documentTitle?: string;
  /** The sentence containing the word. */
  sentence?: string;
}

/**
 * Builds an AnkiConnect note from a copy entry and settings.
 *
 * @param markerOverrides - Optional overrides that take precedence over the
 *   computed marker values.  Used by the content script to inject audio
 *   filenames that were fetched & stored in the background.
 */
export function buildAnkiNote(
  entry: CopyEntry,
  settings: AnkiSettings,
  context?: AnkiNoteContext,
  markerOverrides?: Record<string, string>
): AnkiNote {
  const fields: NoteFields = {};
  const markerValues = buildMarkerValues(entry, context);

  // Apply overrides (e.g. audio filename from background fetch)
  if (markerOverrides) {
    for (const [key, value] of Object.entries(markerOverrides)) {
      markerValues[key] = value;
    }
  }

  for (const [fieldName, template] of Object.entries(settings.fieldTemplates)) {
    fields[fieldName] = renderFieldTemplate(template, markerValues);
  }

  const note: AnkiNote = {
    deckName: settings.deckName,
    modelName: settings.modelName,
    fields,
    tags: [...settings.tags],
    options: {
      allowDuplicate: !settings.checkForDuplicates,
      duplicateScope: settings.duplicateScope,
      duplicateScopeOptions: {
        deckName: settings.deckName,
        checkChildren: true,
        checkAllModels: false,
      },
    },
  };

  return note;
}

// ---------------------------------------------------------------------------
// Marker value builder
// ---------------------------------------------------------------------------

/**
 * Builds a map of ALL supported marker names to their string values.
 * This covers both 10ten-native markers and Yomitan-compatible ones.
 */
function buildMarkerValues(
  entry: CopyEntry,
  context?: AnkiNoteContext
): Record<string, string> {
  switch (entry.type) {
    case 'word':
      return buildWordMarkers(entry.data, context);
    case 'kanji':
      return buildKanjiMarkers(entry.data, context);
    case 'name':
      return buildNameMarkers(entry.data, context);
  }
}

function buildWordMarkers(
  word: WordResult,
  context?: AnkiNoteContext
): Record<string, string> {
  // --- Expression / Reading ---
  const kanjiHeadwords = word.k
    ? word.k.filter((k) => !k.i?.includes('sK'))
    : [];

  const expression = kanjiHeadwords.length
    ? kanjiHeadwords[0].ent
    : (word.r[0]?.ent ?? '');

  const readings = word.r.filter((r) => !r.i?.includes('sk'));
  const reading = readings[0]?.ent ?? '';
  const readingRomaji = readings.map((r) => r.romaji).join(', ');

  // --- Furigana ---
  const furiganaPlain = buildFuriganaPlain(expression, reading);
  const furiganaHtml = buildFuriganaHtml(expression, reading);

  // --- Glossary / Definition ---
  const glossaryFull = serializeSensesHtml(word.s, { brief: false });
  const glossaryBrief = serializeSensesHtml(word.s, { brief: true });
  const glossaryPlain = serializeSensesPlain(word.s);
  const glossaryFirstBrief =
    word.s.length > 0 ? serializeSingleSenseBrief(word.s[0]) : '';
  const glossaryFirstFull =
    word.s.length > 0 ? serializeSingleSenseFull(word.s[0]) : '';

  // --- Part of speech ---
  const posSet = new Set<string>();
  for (const sense of word.s) {
    if (sense.pos) {
      for (const pos of sense.pos) {
        posSet.add(pos);
      }
    }
  }
  const partOfSpeech = Array.from(posSet).join(', ');

  // --- Pitch accent ---
  const pitchPositions: Array<string> = [];
  const pitchCategories: Array<string> = [];
  for (const r of readings) {
    const accentValue = (r as Record<string, unknown>).a;
    if (typeof accentValue === 'number') {
      pitchPositions.push(String(accentValue));
      pitchCategories.push(getPitchCategory(r.ent, accentValue));
    } else if (Array.isArray(accentValue)) {
      for (const accent of accentValue as Array<{ i: number }>) {
        pitchPositions.push(String(accent.i));
        pitchCategories.push(getPitchCategory(r.ent, accent.i));
      }
    }
  }

  // --- Conjugation / Reason ---
  const conjugation = word.reasonChains?.length
    ? word.reasonChains
        .map((chain) =>
          chain
            .map((r) => {
              const key = deinflectL10NKeys[r];
              return key
                ? key.replace('deinflect_', '').replace(/_/g, ' ')
                : String(r);
            })
            .join(' « ')
        )
        .join(', ')
    : '';

  // --- Tags ---
  const tags: Array<string> = [];
  for (const sense of word.s) {
    if (sense.pos) {
      tags.push(...sense.pos);
    }
    if (sense.misc) {
      tags.push(...sense.misc);
    }
    if (sense.field) {
      tags.push(...sense.field);
    }
  }
  const tagsStr = [...new Set(tags)].join(', ');

  return {
    // --- Yomitan-compatible markers ---
    expression: expression,
    reading: reading,
    furigana: furiganaHtml,
    'furigana-plain': furiganaPlain,
    glossary: glossaryFull,
    'glossary-brief': glossaryBrief,
    'glossary-no-dictionary': glossaryBrief,
    'glossary-plain': glossaryPlain,
    'glossary-plain-no-dictionary': glossaryPlain,
    'glossary-first': glossaryFirstFull,
    'glossary-first-brief': glossaryFirstBrief,
    'glossary-first-no-dictionary': glossaryFirstBrief,
    'part-of-speech': partOfSpeech,
    conjugation: conjugation,
    'pitch-accent-positions': pitchPositions.join(', '),
    'pitch-accent-categories': pitchCategories.join(', '),
    'pitch-accents': pitchPositions.join(', '),
    sentence: context?.sentence ?? '',
    url: context?.url ?? '',
    'document-title': context?.documentTitle ?? '',
    'search-query': expression,
    tags: tagsStr,
    // Media markers — 10ten can't fetch audio/images, output empty
    audio: '',
    screenshot: '',
    'clipboard-image': '',
    'clipboard-text': '',
    'popup-selection-text': '',
    'sentence-furigana': '',
    'sentence-furigana-plain': '',
    // Frequency markers — populated from bundled frequency data.
    // {frequencies} emits Yomitan-compatible HTML so card templates that
    // expect that structure render it inline rather than as a collapsible.
    frequencies:
      word.frequencyRank !== undefined
        ? `<ul style="text-align: left;"><li>Global: ${word.frequencyRank}</li></ul>`
        : '',
    'frequency-harmonic-rank':
      word.frequencyRank !== undefined ? String(word.frequencyRank) : '',
    'frequency-harmonic-occurrence': '',
    'frequency-average-rank':
      word.frequencyRank !== undefined ? String(word.frequencyRank) : '',
    'frequency-average-occurrence': '',
    // Cloze markers
    'cloze-body': expression,
    'cloze-body-kana': reading,
    'cloze-prefix': '',
    'cloze-suffix': '',
    // Phonetic
    'phonetic-transcriptions': '',
    // Pitch accent graphs (SVG) — not generated
    'pitch-accent-graphs': '',
    'pitch-accent-graphs-jj': '',
    // Dictionary info
    dictionary: '',
    'dictionary-alias': '',
    // --- 10ten-native markers ---
    'reading-romaji': readingRomaji,
    definition: glossaryBrief,
    'tags-pos': partOfSpeech,
  };
}

function buildKanjiMarkers(
  kanji: KanjiResult,
  context?: AnkiNoteContext
): Record<string, string> {
  const onReadings = kanji.r.on || [];
  const kunReadings = kanji.r.kun || [];
  const allReadings = [...onReadings, ...kunReadings].join('、');
  const meanings = kanji.m.join(', ');

  return {
    expression: kanji.c,
    character: kanji.c,
    reading: allReadings,
    onyomi: onReadings.join('、'),
    kunyomi: kunReadings.join('、'),
    glossary: meanings,
    'glossary-brief': meanings,
    'glossary-plain': meanings,
    'glossary-first': kanji.m[0] ?? '',
    'glossary-first-brief': kanji.m[0] ?? '',
    definition: meanings,
    'stroke-count': kanji.misc?.sc ? String(kanji.misc.sc) : '',
    url: context?.url ?? '',
    'document-title': context?.documentTitle ?? '',
    sentence: context?.sentence ?? '',
    furigana: kanji.c,
    'furigana-plain': kanji.c,
    tags: '',
    'tags-pos': '',
    'part-of-speech': '',
    'reading-romaji': '',
    audio: '',
    'popup-selection-text': '',
    'pitch-accent-positions': '',
    'pitch-accent-categories': '',
    'pitch-accents': '',
    frequencies: '',
    'frequency-harmonic-rank': '',
    'frequency-harmonic-occurrence': '',
    'frequency-average-rank': '',
    'frequency-average-occurrence': '',
    conjugation: '',
    'search-query': kanji.c,
  };
}

function buildNameMarkers(
  name: NameResult,
  context?: AnkiNoteContext
): Record<string, string> {
  const expression = name.k ? name.k.join('、') : name.r.join('、');
  const reading = name.r.join('、');

  const definitions: Array<string> = [];
  for (const tr of name.tr) {
    const parts: Array<string> = [];
    if (tr.type?.length) {
      parts.push(`(${tr.type.join(', ')})`);
    }
    parts.push(tr.det.join(', '));
    definitions.push(parts.join(' '));
  }
  const definition = definitions.join('; ');

  const primaryExpr = name.k?.[0] ?? name.r[0] ?? '';
  const primaryReading = name.r[0] ?? '';

  return {
    expression: expression,
    reading: reading,
    glossary: definition,
    'glossary-brief': definition,
    'glossary-plain': definition,
    'glossary-first': definitions[0] ?? '',
    'glossary-first-brief': definitions[0] ?? '',
    definition: definition,
    furigana: buildFuriganaPlain(primaryExpr, primaryReading),
    'furigana-plain': buildFuriganaPlain(primaryExpr, primaryReading),
    url: context?.url ?? '',
    'document-title': context?.documentTitle ?? '',
    sentence: context?.sentence ?? '',
    tags: '',
    'tags-pos': '',
    'part-of-speech': '',
    'reading-romaji': '',
    audio: '',
    'popup-selection-text': '',
    'pitch-accent-positions': '',
    'pitch-accent-categories': '',
    'pitch-accents': '',
    frequencies: '',
    'frequency-harmonic-rank': '',
    'frequency-harmonic-occurrence': '',
    'frequency-average-rank': '',
    'frequency-average-occurrence': '',
    conjugation: '',
    'search-query': expression,
  };
}

// ---------------------------------------------------------------------------
// Furigana generation
// ---------------------------------------------------------------------------

/**
 * Produces bracket-notation furigana: 漢字[かんじ]
 *
 * Ported from Yomitan's distributeFurigana + furiganaPlain.
 */
function buildFuriganaPlain(expression: string, reading: string): string {
  if (!reading || reading === expression) {
    return expression;
  }

  const segments = distributeFurigana(expression, reading);
  return segments
    .map((seg) => (seg.reading ? `${seg.text}[${seg.reading}]` : seg.text))
    .join(' ');
}

/**
 * Produces HTML ruby furigana: <ruby>漢<rt>かん</rt></ruby><ruby>字<rt>じ</rt></ruby>
 */
function buildFuriganaHtml(expression: string, reading: string): string {
  if (!reading || reading === expression) {
    return expression;
  }

  const segments = distributeFurigana(expression, reading);
  return segments
    .map((seg) =>
      seg.reading ? `<ruby>${seg.text}<rt>${seg.reading}</rt></ruby>` : seg.text
    )
    .join('');
}

interface FuriganaSegment {
  text: string;
  reading: string;
}

/**
 * Distributes a reading across a kanji expression into furigana segments.
 * Simplified port of Yomitan's distributeFurigana().
 */
function distributeFurigana(
  expression: string,
  reading: string
): Array<FuriganaSegment> {
  if (reading === expression || !reading) {
    return [{ text: expression, reading: '' }];
  }

  // If the expression is all kana, no furigana needed
  if (isAllKana(expression)) {
    return [{ text: expression, reading: '' }];
  }

  // Split expression into kanji and kana groups
  const groups: Array<{ text: string; isKana: boolean }> = [];
  let currentGroup = '';
  let currentIsKana: boolean | null = null;

  for (const char of expression) {
    const charIsKana = isKanaChar(char);
    if (charIsKana === currentIsKana) {
      currentGroup += char;
    } else {
      if (currentGroup) {
        groups.push({ text: currentGroup, isKana: currentIsKana! });
      }
      currentGroup = char;
      currentIsKana = charIsKana;
    }
  }
  if (currentGroup) {
    groups.push({ text: currentGroup, isKana: currentIsKana! });
  }

  // If only one group (all kanji), entire reading is the furigana
  if (groups.length === 1) {
    return [{ text: expression, reading }];
  }

  // Try to match kana groups in the reading to split it
  const segments: Array<FuriganaSegment> = [];
  let readingPos = 0;
  const readingNorm = katakanaToHiragana(reading);

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];

    if (group.isKana) {
      // This kana group should appear directly in the reading
      const kanaToFind = katakanaToHiragana(group.text);
      const foundIdx = readingNorm.indexOf(kanaToFind, readingPos);

      if (foundIdx >= 0) {
        // Any reading before this kana belongs to the previous kanji group
        if (foundIdx > readingPos && segments.length > 0) {
          const lastSeg = segments[segments.length - 1];
          if (lastSeg.reading || !lastSeg.reading) {
            // Assign the unmatched reading to the last segment
            lastSeg.reading = reading.slice(readingPos, foundIdx);
          }
        } else if (foundIdx > readingPos) {
          segments.push({
            text: reading.slice(readingPos, foundIdx),
            reading: '',
          });
        }
        segments.push({ text: group.text, reading: '' });
        readingPos = foundIdx + kanaToFind.length;
      } else {
        // Can't find kana in reading — fallback
        return [{ text: expression, reading }];
      }
    } else {
      // Kanji group — reading will be assigned when we find the next kana group
      segments.push({ text: group.text, reading: '' });
    }
  }

  // Any remaining reading goes to the last kanji segment
  if (readingPos < reading.length) {
    const lastKanjiSeg = [...segments]
      .reverse()
      .find((s) => !isAllKana(s.text));
    if (lastKanjiSeg) {
      lastKanjiSeg.reading = reading.slice(readingPos);
    }
  }

  return segments;
}

function isKanaChar(char: string): boolean {
  const code = char.codePointAt(0)!;
  // Hiragana: 3040-309F, Katakana: 30A0-30FF
  return (
    (code >= 0x3040 && code <= 0x309f) || (code >= 0x30a0 && code <= 0x30ff)
  );
}

function isAllKana(text: string): boolean {
  for (const char of text) {
    if (!isKanaChar(char)) {
      return false;
    }
  }
  return text.length > 0;
}

function katakanaToHiragana(text: string): string {
  let result = '';
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code >= 0x30a1 && code <= 0x30f6) {
      result += String.fromCodePoint(code - 0x60);
    } else {
      result += char;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Pitch accent helpers
// ---------------------------------------------------------------------------

function getPitchCategory(reading: string, position: number): string {
  const moraCount = countMorae(reading);
  if (position === 0) {
    return 'heiban';
  }
  if (position === 1) {
    return 'atamadaka';
  }
  if (position === moraCount) {
    return 'odaka';
  }
  return 'nakadaka';
}

function countMorae(reading: string): number {
  // Small kana (ゃゅょぁぃぅぇぉ and their katakana equivalents) are not
  // separate morae.
  const smallKana = new Set([
    'ゃ',
    'ゅ',
    'ょ',
    'ぁ',
    'ぃ',
    'ぅ',
    'ぇ',
    'ぉ',
    'ャ',
    'ュ',
    'ョ',
    'ァ',
    'ィ',
    'ゥ',
    'ェ',
    'ォ',
  ]);
  let count = 0;
  for (const char of reading) {
    if (!smallKana.has(char)) {
      count++;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Glossary / sense serialization
// ---------------------------------------------------------------------------

interface GlossaryOptions {
  brief: boolean;
}

function serializeSensesHtml(
  senses: Array<Sense>,
  options: GlossaryOptions
): string {
  if (senses.length === 0) {
    return '';
  }

  if (senses.length === 1) {
    return options.brief
      ? serializeSingleSenseBrief(senses[0])
      : serializeSingleSenseFull(senses[0]);
  }

  const parts: Array<string> = [];
  let enIndex = 1;

  for (const sense of senses) {
    const isNative = sense.lang && sense.lang !== 'en';
    const prefix = isNative ? '• ' : `(${enIndex++}) `;
    const text = options.brief
      ? serializeSingleSenseBrief(sense)
      : serializeSingleSenseFull(sense);
    parts.push(prefix + text);
  }

  return parts.join('<br>');
}

function serializeSingleSenseFull(sense: Sense): string {
  const parts: Array<string> = [];

  if (sense.pos?.length) {
    parts.push(`<i>(${sense.pos.join(', ')})</i>`);
  }
  if (sense.field?.length) {
    parts.push(`(${sense.field.join(', ')})`);
  }
  if (sense.misc?.length) {
    parts.push(`(${sense.misc.join(', ')})`);
  }

  parts.push(glossesToStr(sense));

  if (sense.inf) {
    parts.push(`(${sense.inf})`);
  }

  return parts.join(' ');
}

function serializeSingleSenseBrief(sense: Sense): string {
  return glossesToStr(sense);
}

function glossesToStr(sense: Sense): string {
  return sense.g
    .map((g) => {
      let text = g.str;
      if (g.type === 'tm') {
        text += '™';
      }
      return text;
    })
    .join('; ');
}

function serializeSensesPlain(senses: Array<Sense>): string {
  if (senses.length === 0) {
    return '';
  }

  return senses
    .map((sense, i) => {
      const prefix = senses.length > 1 ? `(${i + 1}) ` : '';
      return prefix + glossesToStr(sense);
    })
    .join('\n');
}

// ---------------------------------------------------------------------------
// Template rendering
// ---------------------------------------------------------------------------

/**
 * Renders a field template by replacing {markers} with actual data.
 *
 * Supports all Yomitan-compatible markers plus 10ten-native ones.
 * Unknown markers are replaced with empty strings.
 */
function renderFieldTemplate(
  template: string,
  markerValues: Record<string, string>
): string {
  // Replace all {marker-name} patterns
  return template.replace(/\{([\w][\w-]*)\}/g, (_match, markerName: string) => {
    return markerValues[markerName] ?? '';
  });
}
