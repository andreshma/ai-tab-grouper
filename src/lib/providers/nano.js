/**
 * @file Chrome built-in AI (Gemini Nano) via the Prompt API (`LanguageModel`).
 *
 * On-device: nothing leaves the machine. Availability depends on Chrome version,
 * hardware and on whether the API is exposed in the calling context; when
 * `LanguageModel` is missing this provider reports 'unavailable' and the chain
 * falls through.
 */
import { resolveLanguage, t } from '../i18n.js';
import { buildSystemPrompt, buildUserMessage, GROUPING_SCHEMA } from '../prompt.js';

/** Nano's context window is small; cap the batch to stay well inside it. */
export const NANO_MAX_TABS = 30;

/** @param {'auto'|'en'|'es'} setting */
function languageOptions(setting) {
  const language = resolveLanguage(setting);
  return {
    expectedInputs: [{ type: 'text', languages: ['en', language] }],
    expectedOutputs: [{ type: 'text', languages: [language] }],
  };
}

/**
 * @param {'auto'|'en'|'es'} [language]
 * @returns {Promise<'unavailable'|'downloadable'|'downloading'|'available'>}
 */
export async function nanoAvailability(language = 'auto') {
  const LM = /** @type {any} */ (globalThis).LanguageModel;
  if (!LM) return 'unavailable';
  try {
    return await LM.availability(languageOptions(language));
  } catch {
    return 'unavailable';
  }
}

/**
 * Triggers the model download. Must run from a user gesture (options page).
 * @param {'auto'|'en'|'es'} language
 * @param {(fraction:number) => void} onProgress
 */
export async function downloadNanoModel(language, onProgress) {
  const LM = /** @type {any} */ (globalThis).LanguageModel;
  if (!LM) throw new Error(t('err_promptApiBrowser'));
  const session = await LM.create({
    ...languageOptions(language),
    monitor(m) { m.addEventListener('downloadprogress', (e) => onProgress(e.loaded)); },
  });
  session.destroy();
}

/**
 * Classifies tabs on-device with a JSON-schema response constraint.
 * @param {import('./claude.js').ClassifyInput} input
 * @param {{language: 'auto'|'en'|'es', timeoutMs?: number}} opts
 * @returns {Promise<unknown>} Raw `{groups:[...]}`.
 */
export async function classifyWithNano(input, { language, timeoutMs = 30_000 }) {
  const LM = /** @type {any} */ (globalThis).LanguageModel;
  if (!LM) throw new Error(t('err_promptApiContext'));
  const session = await LM.create({
    ...languageOptions(language),
    initialPrompts: [{ role: 'system', content: buildSystemPrompt(language) }],
  });
  try {
    const raw = await session.prompt(
      buildUserMessage({ ...input, tabs: input.tabs.slice(0, NANO_MAX_TABS) }),
      { responseConstraint: GROUPING_SCHEMA, signal: AbortSignal.timeout(timeoutMs) },
    );
    return JSON.parse(raw);
  } finally {
    session.destroy();
  }
}
