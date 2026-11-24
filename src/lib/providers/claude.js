/**
 * @file Claude Messages API provider (direct from the extension, BYO API key).
 *
 * Structured output is enforced with a forced tool call (`tool_choice`), so the
 * response is schema-shaped JSON instead of free text that must be parsed.
 */
import { t } from '../i18n.js';
import { buildSystemPrompt, buildUserMessage, GROUPING_SCHEMA } from '../prompt.js';
import { HttpError, parseRetryAfter, withRetry } from '../resilience.js';

export const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';
const TOOL_NAME = 'assign_tab_groups';

/**
 * @typedef {{tabs: import('../redact.js').TabDescriptor[], existingGroups: string[]}} ClassifyInput
 */

/**
 * Builds the Messages API request body.
 * @param {ClassifyInput} input
 * @param {{model: string, language: 'auto'|'en'|'es'}} opts
 */
export function buildClaudeRequest(input, { model, language }) {
  return {
    model,
    max_tokens: 2048,
    system: buildSystemPrompt(language),
    tools: [{
      name: TOOL_NAME,
      description: 'Assign browser tabs to named, colored groups.',
      input_schema: GROUPING_SCHEMA,
    }],
    tool_choice: { type: 'tool', name: TOOL_NAME },
    messages: [{ role: 'user', content: buildUserMessage(input) }],
  };
}

/**
 * Extracts the forced tool call's input from a Messages API response.
 * @param {any} response
 * @returns {unknown}
 * @throws {Error} When the model did not call the tool.
 */
export function extractToolInput(response) {
  const block = response?.content?.find?.((b) => b?.type === 'tool_use' && b?.name === TOOL_NAME);
  if (!block) throw new Error(t('err_claudeNoToolUse', response?.stop_reason ?? 'n/a'));
  return block.input;
}

/**
 * Request headers. Proxy mode sends NO credential: the proxy injects the key
 * from its vault and authenticates the user via corporate SSO cookies.
 * @param {string} apiKey
 * @param {boolean} viaProxy
 */
export function buildHeaders(apiKey, viaProxy) {
  const base = { 'content-type': 'application/json', 'anthropic-version': ANTHROPIC_VERSION };
  if (viaProxy) return base;
  return {
    ...base,
    'x-api-key': apiKey,
    // Required for browser-origin calls; the key is the user's own (BYOK).
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

/**
 * Classifies tabs with Claude, retrying transient failures with backoff.
 * @param {ClassifyInput} input
 * @param {{apiKey: string, endpoint?: string, model: string, language: 'auto'|'en'|'es', fetchImpl?: typeof fetch,
 *          timeoutMs?: number, retries?: number, sleep?: (ms:number)=>Promise<void>}} opts
 *   endpoint: corporate proxy URL (Messages API compatible). Omit for direct BYOK calls.
 * @returns {Promise<unknown>} Raw `{groups:[...]}` (validate with `normalizeResult`).
 */
export async function classifyWithClaude(input, {
  apiKey, endpoint, model, language, fetchImpl = globalThis.fetch.bind(globalThis), timeoutMs = 20_000, retries = 2, sleep,
}) {
  const viaProxy = Boolean(endpoint);
  const body = JSON.stringify(buildClaudeRequest(input, { model, language }));
  return withRetry(async () => {
    const res = await fetchImpl(endpoint ?? ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: buildHeaders(apiKey, viaProxy),
      // Never send ambient cookies to Anthropic; the proxy needs SSO cookies.
      credentials: viaProxy ? 'include' : 'omit',
      redirect: 'error',
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      throw new HttpError(res.status, `Claude API ${res.status}: ${detail}`, parseRetryAfter(res.headers.get('retry-after')));
    }
    return extractToolInput(await res.json());
  }, { retries, ...(sleep ? { sleep } : {}) });
}
