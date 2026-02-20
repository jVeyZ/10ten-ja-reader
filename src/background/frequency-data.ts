/**
 * Loads and indexes word frequency data from the bundled CSV file.
 *
 * The CSV has three columns: Word, Form, Rank.
 * "Word" is typically the dictionary form (kanji or kana) and "Form" is the
 * specific surface form / reading.
 *
 * We build two indexes:
 *   1. A composite key "word\tform" → rank for exact (kanji, reading) lookups.
 *   2. A fallback key from each individual word/form → best (lowest) rank.
 *
 * Both indexes are normalised to hiragana so that katakana forms in the CSV
 * (e.g. 眼鏡,メガネ) are matched by the dictionary's hiragana readings.
 *
 * Lookups try the composite key first so that e.g. 生/なま (2457) and
 * 生/せい (3483) resolve to their own rank instead of sharing the lowest.
 */
import { kanaToHiragana } from '@birchill/normal-jp';
import browser from 'webextension-polyfill';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FrequencyEntry {
  rank: number;
  word: string;
  form: string;
}

// ---------------------------------------------------------------------------
// Singleton state
// ---------------------------------------------------------------------------

/** Composite "word\tform" → rank for exact pair lookups */
let pairMap: Map<string, number> | undefined;

/** Fallback: individual word or form → best (lowest) rank */
let singleMap: Map<string, number> | undefined;

let loadPromise: Promise<void> | undefined;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ensures the frequency data is loaded.  Safe to call multiple times –
 * subsequent calls are no-ops once loaded.
 */
export function loadFrequencyData(): Promise<void> {
  if (pairMap) {
    return Promise.resolve();
  }

  if (!loadPromise) {
    loadPromise = doLoad();
  }

  return loadPromise;
}

/**
 * Look up the frequency rank for a word.
 *
 * When both kanjiHeadword and kanaReading are provided, ONLY the exact
 * composite "word\treading" key is tried.  This prevents e.g. 生/き from
 * incorrectly picking up 生/なま's rank, or 成る/なる from picking up the
 * kana-only なる frequency.
 *
 * The single-key fallback maps are only consulted when just one of the two
 * parameters is available (kana-only words, or kanji-only lookups).
 *
 * Returns `undefined` when the word is not in the frequency list.
 */
export function getFrequencyRank(
  kanjiHeadword: string | undefined,
  kanaReading: string | undefined
): number | undefined {
  if (!pairMap || !singleMap) {
    return undefined;
  }

  const normKanji = kanjiHeadword ? kanaToHiragana(kanjiHeadword) : undefined;
  const normKana = kanaReading ? kanaToHiragana(kanaReading) : undefined;

  // When we have both kanji and reading, use ONLY the composite key.
  // Falling back to individual keys would give the wrong reading's rank.
  if (normKanji && normKana) {
    return pairMap.get(normKanji + '\t' + normKana);
  }

  // Kanji-only lookup (no reading available)
  if (normKanji) {
    return singleMap.get(normKanji);
  }

  // Kana-only lookup (no kanji headword — the word itself is kana)
  if (normKana) {
    return singleMap.get(normKana);
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function doLoad(): Promise<void> {
  try {
    const url = browser.runtime.getURL('data/frequency_list_global.csv');
    const response = await fetch(url);
    const text = await response.text();

    const pairs = new Map<string, number>();
    const singles = new Map<string, number>();

    // Skip header line
    const lines = text.split('\n');
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) {
        continue;
      }

      // CSV format: Word,Form,Rank
      const firstComma = line.indexOf(',');
      if (firstComma === -1) {
        continue;
      }
      const lastComma = line.lastIndexOf(',');
      if (lastComma === firstComma) {
        continue;
      }

      const word = line.substring(0, firstComma);
      const form = line.substring(firstComma + 1, lastComma);
      const rank = parseInt(line.substring(lastComma + 1), 10);

      if (Number.isNaN(rank)) {
        continue;
      }

      // Normalise the form to hiragana so that katakana readings in the CSV
      // (e.g. メガネ) match the dictionary's hiragana readings (めがね).
      const normWord = kanaToHiragana(word);
      const normForm = kanaToHiragana(form);

      // Composite key for exact (word, form) pair lookups
      const compositeKey = normWord + '\t' + normForm;
      if (!pairs.has(compositeKey) || pairs.get(compositeKey)! > rank) {
        pairs.set(compositeKey, rank);
      }

      // Fallback: keep the best (lowest) rank for each individual key
      if (!singles.has(normWord) || singles.get(normWord)! > rank) {
        singles.set(normWord, rank);
      }
      if (
        normForm !== normWord &&
        (!singles.has(normForm) || singles.get(normForm)! > rank)
      ) {
        singles.set(normForm, rank);
      }
    }

    pairMap = pairs;
    singleMap = singles;
  } catch (e) {
    console.error('[10ten-ja-reader] Failed to load frequency data:', e);
    // Don't prevent the extension from working if frequency data fails
    pairMap = new Map();
    singleMap = new Map();
  }
}
