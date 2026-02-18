import { useCallback, useEffect, useState } from 'preact/hooks';

import type { AnkiSettings as AnkiSettingsType } from '../common/anki-types';
import { ANKI_FIELD_MARKERS } from '../common/anki-types';
import type { Config } from '../common/config';

import { SectionHeading } from './SectionHeading';
import { useConfigValue } from './use-config-value';

type Props = { config: Config };

export function AnkiSettings(props: Props) {
  const settings = useConfigValue(props.config, 'ankiConnect');
  const [connectionStatus, setConnectionStatus] = useState<
    'unknown' | 'connected' | 'disconnected' | 'checking'
  >('unknown');
  const [deckNames, setDeckNames] = useState<Array<string>>([]);
  const [modelNames, setModelNames] = useState<Array<string>>([]);
  const [fieldNames, setFieldNames] = useState<Array<string>>([]);

  const updateSettings = useCallback(
    (update: Partial<AnkiSettingsType>) => {
      props.config.ankiConnect = { ...settings, ...update };
    },
    [props.config, settings]
  );

  // Test connection
  const testConnection = useCallback(async () => {
    setConnectionStatus('checking');
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'ankiIsConnected',
      });
      if (result) {
        setConnectionStatus('connected');
        // Fetch deck and model names
        const [decks, models] = await Promise.all([
          chrome.runtime.sendMessage({ type: 'ankiGetDeckNames' }),
          chrome.runtime.sendMessage({ type: 'ankiGetModelNames' }),
        ]);
        if (Array.isArray(decks)) {
          setDeckNames(decks);
        }
        if (Array.isArray(models)) {
          setModelNames(models);
        }
      } else {
        setConnectionStatus('disconnected');
      }
    } catch {
      setConnectionStatus('disconnected');
    }
  }, []);

  // Fetch field names when model changes
  useEffect(() => {
    if (!settings.modelName || connectionStatus !== 'connected') {
      return;
    }
    chrome.runtime
      .sendMessage({
        type: 'ankiGetModelFieldNames',
        modelName: settings.modelName,
      })
      .then((fields: unknown) => {
        if (Array.isArray(fields)) {
          setFieldNames(fields);
        }
      })
      .catch(() => {
        // Ignore
      });
  }, [settings.modelName, connectionStatus]);

  // Auto-test connection when enabled
  useEffect(() => {
    if (settings.enabled) {
      void testConnection();
    }
  }, [settings.enabled, settings.server]);

  return (
    <>
      <SectionHeading>AnkiConnect</SectionHeading>
      <div class="flex flex-col gap-4 py-4">
        {/* Enable toggle */}
        <label class="flex items-center gap-3">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) =>
              updateSettings({
                enabled: (e.target as HTMLInputElement).checked,
              })
            }
          />
          <span>Enable AnkiConnect integration</span>
        </label>

        {settings.enabled && (
          <>
            {/* Server URL */}
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium" htmlFor="anki-server">
                Server URL
              </label>
              <div class="flex gap-2">
                <input
                  id="anki-server"
                  type="text"
                  class="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm"
                  value={settings.server}
                  onInput={(e) =>
                    updateSettings({
                      server: (e.target as HTMLInputElement).value,
                    })
                  }
                />
                <button
                  type="button"
                  class="rounded bg-blue-500 px-3 py-1.5 text-sm text-white hover:bg-blue-600 disabled:opacity-50"
                  onClick={testConnection}
                  disabled={connectionStatus === 'checking'}
                >
                  {connectionStatus === 'checking' ? 'Testing...' : 'Test'}
                </button>
              </div>
              <ConnectionStatusBadge status={connectionStatus} />
            </div>

            {/* API Key (optional) */}
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium" htmlFor="anki-api-key">
                API Key (optional)
              </label>
              <input
                id="anki-api-key"
                type="password"
                class="rounded border border-gray-300 px-3 py-1.5 text-sm"
                value={settings.apiKey}
                onInput={(e) =>
                  updateSettings({
                    apiKey: (e.target as HTMLInputElement).value,
                  })
                }
                placeholder="Leave empty if not required"
              />
            </div>

            {/* Deck name */}
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium" htmlFor="anki-deck">
                Deck
              </label>
              {deckNames.length > 0 ? (
                <select
                  id="anki-deck"
                  class="rounded border border-gray-300 px-3 py-1.5 text-sm"
                  value={settings.deckName}
                  onChange={(e) =>
                    updateSettings({
                      deckName: (e.target as HTMLSelectElement).value,
                    })
                  }
                >
                  {deckNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="anki-deck"
                  type="text"
                  class="rounded border border-gray-300 px-3 py-1.5 text-sm"
                  value={settings.deckName}
                  onInput={(e) =>
                    updateSettings({
                      deckName: (e.target as HTMLInputElement).value,
                    })
                  }
                  placeholder="Default"
                />
              )}
            </div>

            {/* Model name */}
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium" htmlFor="anki-model">
                Note Type (Model)
              </label>
              {modelNames.length > 0 ? (
                <select
                  id="anki-model"
                  class="rounded border border-gray-300 px-3 py-1.5 text-sm"
                  value={settings.modelName}
                  onChange={(e) =>
                    updateSettings({
                      modelName: (e.target as HTMLSelectElement).value,
                    })
                  }
                >
                  {modelNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="anki-model"
                  type="text"
                  class="rounded border border-gray-300 px-3 py-1.5 text-sm"
                  value={settings.modelName}
                  onInput={(e) =>
                    updateSettings({
                      modelName: (e.target as HTMLInputElement).value,
                    })
                  }
                  placeholder="Basic"
                />
              )}
            </div>

            {/* Tags */}
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium" htmlFor="anki-tags">
                Tags (comma-separated)
              </label>
              <input
                id="anki-tags"
                type="text"
                class="rounded border border-gray-300 px-3 py-1.5 text-sm"
                value={settings.tags.join(', ')}
                onInput={(e) =>
                  updateSettings({
                    tags: (e.target as HTMLInputElement).value
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="10ten"
              />
            </div>

            {/* Field templates */}
            <div class="flex flex-col gap-2">
              <div class="text-sm font-medium">Field Mappings</div>
              <div class="mb-1 text-xs text-gray-500">
                Use markers:{' '}
                {ANKI_FIELD_MARKERS.map((m, i) => (
                  <span key={m}>
                    {i > 0 && ', '}
                    <code class="rounded bg-gray-100 px-1">
                      {'{'}
                      {m}
                      {'}'}
                    </code>
                  </span>
                ))}
              </div>

              {fieldNames.length > 0
                ? // Show fields from the selected model
                  fieldNames.map((fieldName) => (
                    <div key={fieldName} class="flex flex-col gap-0.5">
                      <label class="text-xs text-gray-600">{fieldName}</label>
                      <input
                        type="text"
                        class="rounded border border-gray-300 px-3 py-1.5 font-mono text-sm"
                        value={settings.fieldTemplates[fieldName] || ''}
                        onInput={(e) =>
                          updateSettings({
                            fieldTemplates: {
                              ...settings.fieldTemplates,
                              [fieldName]: (e.target as HTMLInputElement).value,
                            },
                          })
                        }
                        placeholder={`Template for ${fieldName}`}
                      />
                    </div>
                  ))
                : // Show existing templates as editable key-value pairs
                  Object.entries(settings.fieldTemplates).map(
                    ([fieldName, template]) => (
                      <div key={fieldName} class="flex items-center gap-2">
                        <input
                          type="text"
                          class="w-28 rounded border border-gray-300 px-2 py-1.5 text-sm"
                          value={fieldName}
                          readOnly
                        />
                        <span class="text-gray-400">=</span>
                        <input
                          type="text"
                          class="flex-1 rounded border border-gray-300 px-2 py-1.5 font-mono text-sm"
                          value={template}
                          onInput={(e) =>
                            updateSettings({
                              fieldTemplates: {
                                ...settings.fieldTemplates,
                                [fieldName]: (e.target as HTMLInputElement)
                                  .value,
                              },
                            })
                          }
                        />
                      </div>
                    )
                  )}
            </div>

            {/* Duplicate scope */}
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium" htmlFor="anki-dup-scope">
                Duplicate Check Scope
              </label>
              <select
                id="anki-dup-scope"
                class="rounded border border-gray-300 px-3 py-1.5 text-sm"
                value={settings.duplicateScope}
                onChange={(e) =>
                  updateSettings({
                    duplicateScope: (e.target as HTMLSelectElement).value as
                      | 'collection'
                      | 'deck'
                      | 'deck-root',
                  })
                }
              >
                <option value="collection">Entire collection</option>
                <option value="deck">Current deck</option>
                <option value="deck-root">Root deck</option>
              </select>
            </div>

            {/* Check for duplicates */}
            <label class="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.checkForDuplicates}
                onChange={(e) =>
                  updateSettings({
                    checkForDuplicates: (e.target as HTMLInputElement).checked,
                  })
                }
              />
              <span class="text-sm">Check for duplicates before adding</span>
            </label>
          </>
        )}
      </div>
    </>
  );
}

function ConnectionStatusBadge({
  status,
}: {
  status: 'unknown' | 'connected' | 'disconnected' | 'checking';
}) {
  switch (status) {
    case 'connected':
      return (
        <span class="flex items-center gap-1 text-xs text-green-600">
          <span class="inline-block h-2 w-2 rounded-full bg-green-500" />
          Connected to Anki
        </span>
      );
    case 'disconnected':
      return (
        <span class="flex items-center gap-1 text-xs text-red-600">
          <span class="inline-block h-2 w-2 rounded-full bg-red-500" />
          Cannot connect. Make sure Anki is running with AnkiConnect installed.
        </span>
      );
    case 'checking':
      return (
        <span class="flex items-center gap-1 text-xs text-blue-600">
          <span class="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
          Checking connection...
        </span>
      );
    default:
      return null;
  }
}
