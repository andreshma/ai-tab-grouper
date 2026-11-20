/**
 * @file Provider chain: tries each enabled provider in order, falls through on
 * failure, and validates whatever comes back. Pure orchestration — all I/O is
 * injected via `deps` so it is unit-testable without Chrome.
 */
import { hasRemoteConsent, resolveProviderOrder } from './config.js';
import { groupByDomain } from './heuristic.js';
import { isHostExcluded } from './redact.js';
import { normalizeResult } from './validate.js';

/**
 * @typedef {Object} ClassifierDeps
 * @property {(settings: any) => Promise<string>} getApiKey  Usable BYOK key under current policy.
 * @property {(name: string) => import('./resilience.js').CircuitBreaker} breakerFor
 * @property {(language: string) => Promise<string>} nanoAvailability
 * @property {(input: any, opts: any) => Promise<unknown>} classifyWithClaude
 * @property {(input: any, opts: any) => Promise<unknown>} classifyWithNano
 */

/**
 * @typedef {Object} ClassificationResult
 * @property {string} provider   Provider that produced `groups` ('none' if all failed/skipped).
 * @property {import('./validate.js').GroupAssignment[]} groups
 * @property {{provider: string, message: string}[]} errors  Failures/skips, for status UI.
 */

const SKIP = Symbol('skip');

/**
 * @param {{tabs: import('./redact.js').TabDescriptor[], existingGroups: string[], localOnlyGroups?: string[]}} input
 *   `localOnlyGroups`: existing titles that must not be sent to a remote provider.
 * @param {import('./config.js').Settings & {proxyEndpoint?: string}} settings  Effective (policy-applied) settings.
 * @param {ClassifierDeps} deps
 * @returns {Promise<ClassificationResult>}
 */
export async function classifyTabs(input, settings, deps) {
  const validIds = new Set(input.tabs.map((t) => t.id));
  const norm = { existingTitles: input.existingGroups, minGroupSize: settings.minGroupSize };
  /** @type {ClassificationResult['errors']} */
  const errors = [];

  for (const provider of resolveProviderOrder(settings)) {
    const breaker = provider === 'heuristic' ? null : deps.breakerFor(provider);
    if (breaker && (await breaker.isOpen())) {
      errors.push({ provider, message: 'circuit breaker abierto' });
      continue;
    }
    try {
      const raw = await runProvider(provider, input, settings, deps);
      if (raw === SKIP) {
        errors.push({ provider, message: 'no disponible' });
        continue;
      }
      await breaker?.recordSuccess();
      return { provider, groups: normalizeResult(raw, validIds, norm), errors };
    } catch (err) {
      await breaker?.recordFailure();
      errors.push({ provider, message: /** @type {Error} */ (err)?.message ?? String(err) });
    }
  }
  return { provider: 'none', groups: [], errors };
}

/**
 * @returns {Promise<unknown|typeof SKIP>}
 */
async function runProvider(provider, input, settings, deps) {
  switch (provider) {
    case 'claude': {
      // No data leaves the device without informed, current consent (CWS Disclosure Requirements).
      if (!hasRemoteConsent(settings)) return SKIP;
      // Corporate proxy (key in vault) takes precedence over a device-held BYOK key.
      const endpoint = settings.proxyEndpoint || undefined;
      const apiKey = endpoint ? '' : await deps.getApiKey(settings);
      if (!endpoint && !apiKey) return SKIP;
      // Excluded hosts never leave the device: grouped locally, merged in.
      const remote = input.tabs.filter((t) => !isHostExcluded(t.host, settings.excludedHosts));
      const local = input.tabs.filter((t) => isHostExcluded(t.host, settings.excludedHosts));
      const raw = remote.length
        ? /** @type {any} */ (await deps.classifyWithClaude(
          { tabs: remote, existingGroups: input.existingGroups.filter((name) => !(input.localOnlyGroups ?? []).includes(name)) },
          { apiKey, endpoint, model: settings.claudeModel, language: settings.language },
        ))
        : { groups: [] };
      const groups = Array.isArray(raw?.groups) ? raw.groups : [];
      return { groups: [...groups, ...groupByDomain(local).groups] };
    }
    case 'nano': {
      if ((await deps.nanoAvailability(settings.language)) !== 'available') return SKIP;
      return deps.classifyWithNano(input, { language: settings.language });
    }
    case 'heuristic':
      return groupByDomain(input.tabs);
    default:
      return SKIP;
  }
}
