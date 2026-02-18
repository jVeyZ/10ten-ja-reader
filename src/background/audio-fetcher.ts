import { arrayBufferToBase64 } from '../utils/array-buffer-to-base64';

import type { AnkiConnect } from './anki-connect';

// -------------------------------------------------------------------------
// Audio source types
// -------------------------------------------------------------------------

export type AudioSourceType = 'jpod101' | 'jisho';

interface AudioResult {
  filename: string;
  base64: string;
  contentType: string;
}

/**
 * SHA-256 hash of the well-known JapanesePod101 "no audio available" MP3.
 * When this hash is returned, the response is treated as invalid.
 */
const JPOD101_INVALID_AUDIO_HASH =
  'ae6398b5a27bc8c0a771df6c907ade794be15518174773c58c7c7ddd17098906';

/**
 * Default ordered list of audio sources to try.  Each source is attempted in
 * order; the first successful download wins.
 */
const DEFAULT_AUDIO_SOURCES: Array<AudioSourceType> = ['jpod101', 'jisho'];

// -------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------

/**
 * Fetch audio for a Japanese term from multiple sources (JapanesePod101,
 * then Jisho fallback) and store it into Anki via AnkiConnect.
 *
 * Follows the same fallback-chain approach used by Yomitan:
 * 1. JapanesePod101 - direct MP3 endpoint (fast, high quality)
 * 2. Jisho.org - scrape search page for first .mp3 URL
 *
 * @returns The stored filename on success, or `null` if no audio was found.
 */
export async function fetchAndStoreAudio(
  ankiConnect: AnkiConnect,
  expression: string,
  reading?: string
): Promise<string | null> {
  for (const source of DEFAULT_AUDIO_SOURCES) {
    try {
      const result = await fetchAudioFromSource(source, expression, reading);
      if (!result) {
        continue;
      }

      // Store into Anki media collection
      const storedName = await ankiConnect.storeMediaFile(
        result.filename,
        result.base64
      );
      if (storedName) {
        return storedName;
      }
    } catch (e) {
      console.warn(`Audio source "${source}" failed for "${expression}":`, e);
    }
  }

  return null;
}

// -------------------------------------------------------------------------
// Source-specific fetchers
// -------------------------------------------------------------------------

async function fetchAudioFromSource(
  source: AudioSourceType,
  expression: string,
  reading?: string
): Promise<AudioResult | null> {
  switch (source) {
    case 'jpod101':
      return fetchFromJapanesePod101(expression, reading);
    case 'jisho':
      return fetchFromJisho(expression);
  }
}

/**
 * JapanesePod101 direct audio endpoint.
 *
 * URL format:
 *   https://assets.languagepod101.com/dictionary/japanese/audiomp3.php?kanji=...&kana=...
 *
 * Returns an MP3. If no audio exists the server returns a small "no audio
 * available" clip whose SHA-256 is well-known; we reject that.
 */
async function fetchFromJapanesePod101(
  expression: string,
  reading?: string
): Promise<AudioResult | null> {
  const params = new URLSearchParams();
  params.set('kanji', expression);
  if (reading) {
    params.set('kana', reading);
  }

  const url = `https://assets.languagepod101.com/dictionary/japanese/audiomp3.php?${params.toString()}`;

  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }

  const buffer = await response.arrayBuffer();

  // Validate: reject the well-known "no audio" placeholder
  if (await isInvalidJpod101Audio(buffer)) {
    return null;
  }

  const base64 = arrayBufferToBase64(buffer);
  return buildAudioResult(expression, base64);
}

/**
 * Jisho.org audio scraper - searches for the expression and grabs the first
 * .mp3 URL found on the page.
 */
async function fetchFromJisho(expression: string): Promise<AudioResult | null> {
  const searchUrl = `https://jisho.org/search/${encodeURIComponent(expression)}`;

  const res = await fetch(searchUrl);
  if (!res.ok) {
    return null;
  }

  const html = await res.text();

  // Heuristic: find first .mp3 URL on the page.
  const mp3Re = /https?:\/\/[^"'<>\s]+\.mp3/g;
  const mp3Match = html.match(mp3Re);
  if (!mp3Match || !mp3Match.length) {
    return null;
  }

  const mp3Url = mp3Match[0];
  const audioResp = await fetch(mp3Url);
  if (!audioResp.ok) {
    return null;
  }

  const buffer = await audioResp.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);

  return buildAudioResult(expression, base64);
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function buildAudioResult(expression: string, base64: string): AudioResult {
  const safeExpr = expression.replace(/[^a-z0-9_-]/gi, '_').slice(0, 80);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `10ten_audio_${safeExpr}_${timestamp}.mp3`;
  return { filename, base64, contentType: 'audio/mpeg' };
}

/**
 * Checks whether an ArrayBuffer matches the well-known JapanesePod101
 * "no audio available" placeholder by comparing its SHA-256 hash.
 */
async function isInvalidJpod101Audio(buffer: ArrayBuffer): Promise<boolean> {
  try {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return hashHex === JPOD101_INVALID_AUDIO_HASH;
  } catch {
    // If crypto.subtle is unavailable (e.g. insecure context), skip validation
    return false;
  }
}
