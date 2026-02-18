/**
 * AnkiConnect client for communicating with the AnkiConnect plugin
 * running in Anki desktop.
 *
 * Ported from Yomitan's anki-connect.js and adapted for 10ten-ja-reader.
 * Original: https://github.com/yomidevs/yomitan
 *
 * AnkiConnect API: https://foosoft.net/projects/anki-connect/
 */
import type {
  AnkiConnectMessageBody,
  AnkiNote,
  AnkiNoteWithId,
  CanAddNoteDetail,
  CardId,
  CardInfo,
  NoteFieldInfo,
  NoteId,
  NoteInfo,
} from '../common/anki-types';

export class AnkiConnect {
  private _enabled = false;
  private _server: string | null = null;
  private _localVersion = 2;
  private _remoteVersion = 0;
  private _versionCheckPromise: Promise<number> | null = null;
  private _apiKey: string | null = null;

  get server(): string | null {
    return this._server;
  }

  set server(value: string) {
    this._server = value;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    this._enabled = value;
  }

  get apiKey(): string | null {
    return this._apiKey;
  }

  set apiKey(value: string | null) {
    this._apiKey = value;
  }

  /**
   * Checks whether a connection to AnkiConnect can be established.
   */
  async isConnected(): Promise<boolean> {
    try {
      await this._getVersion();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets the AnkiConnect API version number.
   */
  async getVersion(): Promise<number | null> {
    if (!this._enabled) {
      return null;
    }
    await this._checkVersion();
    return await this._getVersion();
  }

  /**
   * Adds a note to Anki.
   */
  async addNote(note: AnkiNote): Promise<NoteId | null> {
    if (!this._enabled) {
      return null;
    }
    await this._checkVersion();
    const result = await this._invoke('addNote', { note });
    if (result !== null && typeof result !== 'number') {
      throw this._createUnexpectedResultError('number|null', result);
    }
    return result as NoteId | null;
  }

  /**
   * Updates the fields of an existing note.
   */
  async updateNoteFields(noteWithId: AnkiNoteWithId): Promise<null> {
    if (!this._enabled) {
      return null;
    }
    await this._checkVersion();
    const result = await this._invoke('updateNoteFields', { note: noteWithId });
    if (result !== null) {
      throw this._createUnexpectedResultError('null', result);
    }
    return result;
  }

  /**
   * Checks if notes can be added (i.e. no duplicates if not allowed).
   */
  async canAddNotes(notes: Array<AnkiNote>): Promise<Array<boolean>> {
    if (!this._enabled) {
      return new Array(notes.length).fill(false);
    }
    await this._checkVersion();
    const result = await this._invoke('canAddNotes', { notes });
    return this._normalizeArray<boolean>(result, notes.length, 'boolean');
  }

  /**
   * Checks if notes can be added, with detailed error info.
   */
  async canAddNotesWithErrorDetail(
    notes: Array<AnkiNote>
  ): Promise<Array<CanAddNoteDetail>> {
    if (!this._enabled) {
      return notes.map(() => ({ canAdd: false, error: null }));
    }
    await this._checkVersion();
    const result = await this._invoke('canAddNotesWithErrorDetail', { notes });
    return this._normalizeCanAddNotesWithErrorDetailArray(result, notes.length);
  }

  /**
   * Gets information about existing notes.
   */
  async notesInfo(noteIds: Array<NoteId>): Promise<Array<NoteInfo | null>> {
    if (!this._enabled) {
      return [];
    }
    await this._checkVersion();
    const result = await this._invoke('notesInfo', { notes: noteIds });
    return this._normalizeNoteInfoArray(result);
  }

  /**
   * Gets information about existing cards.
   */
  async cardsInfo(cardIds: Array<CardId>): Promise<Array<CardInfo | null>> {
    if (!this._enabled) {
      return [];
    }
    await this._checkVersion();
    const result = await this._invoke('cardsInfo', { cards: cardIds });
    return this._normalizeCardInfoArray(result);
  }

  /**
   * Returns all deck names in Anki.
   */
  async getDeckNames(): Promise<Array<string>> {
    if (!this._enabled) {
      return [];
    }
    await this._checkVersion();
    const result = await this._invoke('deckNames', {});
    return this._normalizeArray<string>(result, -1, 'string');
  }

  /**
   * Returns all model (note type) names in Anki.
   */
  async getModelNames(): Promise<Array<string>> {
    if (!this._enabled) {
      return [];
    }
    await this._checkVersion();
    const result = await this._invoke('modelNames', {});
    return this._normalizeArray<string>(result, -1, 'string');
  }

  /**
   * Returns the field names for a given model (note type).
   */
  async getModelFieldNames(modelName: string): Promise<Array<string>> {
    if (!this._enabled) {
      return [];
    }
    await this._checkVersion();
    const result = await this._invoke('modelFieldNames', { modelName });
    return this._normalizeArray<string>(result, -1, 'string');
  }

  /**
   * Opens the Anki browser with the given query.
   */
  async guiBrowse(query: string): Promise<Array<CardId>> {
    if (!this._enabled) {
      return [];
    }
    await this._checkVersion();
    const result = await this._invoke('guiBrowse', { query });
    return this._normalizeArray<CardId>(result, -1, 'number');
  }

  /**
   * Opens the Anki browser for a specific note.
   */
  async guiBrowseNote(noteId: NoteId): Promise<Array<CardId>> {
    return await this.guiBrowse(`nid:${noteId}`);
  }

  /**
   * Stores a media file (base64 encoded) in Anki's media folder.
   */
  async storeMediaFile(
    fileName: string,
    content: string
  ): Promise<string | null> {
    if (!this._enabled) {
      throw new Error('AnkiConnect not enabled');
    }
    await this._checkVersion();
    const result = await this._invoke('storeMediaFile', {
      filename: fileName,
      data: content,
    });
    if (result !== null && typeof result !== 'string') {
      throw this._createUnexpectedResultError('string|null', result);
    }
    return result as string | null;
  }

  /**
   * Finds notes matching a query.
   */
  async findNotes(query: string): Promise<Array<NoteId>> {
    if (!this._enabled) {
      return [];
    }
    await this._checkVersion();
    const result = await this._invoke('findNotes', { query });
    return this._normalizeArray<NoteId>(result, -1, 'number');
  }

  /**
   * Suspends the given cards.
   */
  async suspendCards(cardIds: Array<CardId>): Promise<boolean> {
    if (!this._enabled) {
      return false;
    }
    await this._checkVersion();
    const result = await this._invoke('suspend', { cards: cardIds });
    return typeof result === 'boolean' && result;
  }

  /**
   * Finds cards matching a query.
   */
  async findCards(query: string): Promise<Array<CardId>> {
    if (!this._enabled) {
      return [];
    }
    await this._checkVersion();
    const result = await this._invoke('findCards', { query });
    return this._normalizeArray<CardId>(result, -1, 'number');
  }

  /**
   * Finds cards belonging to a specific note.
   */
  async findCardsForNote(noteId: NoteId): Promise<Array<CardId>> {
    return await this.findCards(`nid:${noteId}`);
  }

  /**
   * Forces an Anki sync.
   */
  async sync(): Promise<boolean> {
    if (!this._enabled) {
      return false;
    }
    await this._checkVersion();
    const result = await this._invoke('sync', {});
    return result === null;
  }

  // ---------------------------------------------------------------------------
  // Private methods
  // ---------------------------------------------------------------------------

  private async _checkVersion(): Promise<void> {
    if (this._remoteVersion < this._localVersion) {
      if (this._versionCheckPromise === null) {
        const promise = this._getVersion();
        promise
          .catch(() => {
            // Ignore
          })
          .finally(() => {
            this._versionCheckPromise = null;
          });
        this._versionCheckPromise = promise;
      }
      this._remoteVersion = await this._versionCheckPromise;
      if (this._remoteVersion < this._localVersion) {
        throw new Error(
          'AnkiConnect extension and plugin versions incompatible'
        );
      }
    }
  }

  private async _invoke(
    action: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const body: AnkiConnectMessageBody = {
      action,
      params,
      version: this._localVersion,
    };
    if (this._apiKey !== null && this._apiKey !== '') {
      body.key = this._apiKey;
    }

    let response: Response;
    try {
      if (this._server === null) {
        throw new Error('AnkiConnect server URL is not set');
      }
      response = await fetch(this._server, {
        method: 'POST',
        mode: 'cors',
        cache: 'default',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        redirect: 'follow',
        referrerPolicy: 'no-referrer',
        body: JSON.stringify(body),
      });
    } catch (e) {
      // Preserve the original error as the cause so linters and
      // diagnostics can see the underlying exception.
      throw new Error(
        `AnkiConnect connection failure: ${e instanceof Error ? e.message : String(e)}`,
        { cause: e }
      );
    }

    if (!response.ok) {
      throw new Error(`AnkiConnect connection error: ${response.status}`);
    }

    let responseText: string | null = null;
    let result: unknown;
    try {
      responseText = await response.text();
      result = JSON.parse(responseText);
    } catch (err) {
      // Attach the original parse error as the cause.
      throw new Error(
        `Invalid AnkiConnect response: status=${response.status}, body=${responseText}`,
        { cause: err }
      );
    }

    if (
      typeof result === 'object' &&
      result !== null &&
      !Array.isArray(result)
    ) {
      const apiError = (result as Record<string, unknown>).error;
      if (typeof apiError !== 'undefined' && apiError !== null) {
        throw new Error(`Anki error: ${String(apiError)}`);
      }
      // Return the 'result' field from the response
      return (result as Record<string, unknown>).result;
    }

    return result;
  }

  private async _getVersion(): Promise<number> {
    const version = await this._invoke('version', {});
    return typeof version === 'number' ? version : 0;
  }

  private _createUnexpectedResultError(
    expectedType: string,
    result: unknown
  ): Error {
    const actualType =
      result === null
        ? 'null'
        : Array.isArray(result)
          ? 'array'
          : typeof result;
    return new Error(
      `Unexpected AnkiConnect result: expected ${expectedType}, received ${actualType}`
    );
  }

  private _normalizeArray<T>(
    result: unknown,
    expectedCount: number,
    type: string
  ): Array<T> {
    if (!Array.isArray(result)) {
      throw this._createUnexpectedResultError(`${type}[]`, result);
    }
    if (expectedCount >= 0 && expectedCount !== result.length) {
      throw new Error(
        `Unexpected result array size: expected ${expectedCount}, received ${result.length}`
      );
    }
    for (let i = 0; i < result.length; i++) {
      if (typeof result[i] !== type) {
        throw new Error(
          `Unexpected result type at index ${i}: expected ${type}, received ${typeof result[i]}`
        );
      }
    }
    return result as Array<T>;
  }

  private _normalizeNoteInfoArray(result: unknown): Array<NoteInfo | null> {
    if (!Array.isArray(result)) {
      throw this._createUnexpectedResultError('array', result);
    }
    const output: Array<NoteInfo | null> = [];
    for (let i = 0; i < result.length; i++) {
      const item = result[i];
      if (item === null || typeof item !== 'object') {
        throw new Error(
          `Unexpected result type at index ${i}: expected NoteInfo, received ${typeof item}`
        );
      }
      const { noteId, tags, fields, modelName, cards } = item;
      if (typeof noteId !== 'number') {
        output.push(null);
        continue;
      }
      if (typeof modelName !== 'string') {
        throw new Error(
          `Unexpected type at index ${i} for modelName: expected string`
        );
      }
      const normalizedTags = this._normalizeArray<string>(tags, -1, 'string');
      const normalizedCards = this._normalizeArray<number>(cards, -1, 'number');

      const normalizedFields: Record<string, NoteFieldInfo> = {};
      if (typeof fields === 'object' && fields !== null) {
        for (const [key, fieldInfo] of Object.entries(
          fields as Record<string, unknown>
        )) {
          if (typeof fieldInfo !== 'object' || fieldInfo === null) {
            continue;
          }
          const { value, order } = fieldInfo as Record<string, unknown>;
          if (typeof value === 'string' && typeof order === 'number') {
            normalizedFields[key] = { value, order };
          }
        }
      }

      output.push({
        noteId,
        tags: normalizedTags,
        fields: normalizedFields,
        modelName,
        cards: normalizedCards,
      });
    }
    return output;
  }

  private _normalizeCardInfoArray(result: unknown): Array<CardInfo | null> {
    if (!Array.isArray(result)) {
      throw this._createUnexpectedResultError('array', result);
    }
    const output: Array<CardInfo | null> = [];
    for (let i = 0; i < result.length; i++) {
      const item = result[i];
      if (item === null || typeof item !== 'object') {
        throw new Error(
          `Unexpected result type at index ${i}: expected CardInfo`
        );
      }
      const { cardId, note, flags, queue } = item as Record<string, unknown>;
      if (typeof cardId !== 'number' || typeof note !== 'number') {
        output.push(null);
        continue;
      }
      output.push({
        noteId: note,
        cardId,
        flags: typeof flags === 'number' ? flags : 0,
        cardState: typeof queue === 'number' ? queue : 0,
      });
    }
    return output;
  }

  private _normalizeCanAddNotesWithErrorDetailArray(
    result: unknown,
    expectedCount: number
  ): Array<CanAddNoteDetail> {
    if (!Array.isArray(result)) {
      throw this._createUnexpectedResultError('array', result);
    }
    if (expectedCount !== result.length) {
      throw new Error(
        `Unexpected result array size: expected ${expectedCount}, received ${result.length}`
      );
    }
    const output: Array<CanAddNoteDetail> = [];
    for (let i = 0; i < expectedCount; i++) {
      const item = result[i];
      if (item === null || typeof item !== 'object') {
        throw new Error(
          `Unexpected result type at index ${i}: expected object`
        );
      }
      const { canAdd, error } = item as Record<string, unknown>;
      if (typeof canAdd !== 'boolean') {
        throw new Error(
          `Unexpected type at index ${i} for canAdd: expected boolean`
        );
      }
      output.push({ canAdd, error: typeof error === 'string' ? error : null });
    }
    return output;
  }
}
