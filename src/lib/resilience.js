/**
 * @file Retry with exponential backoff + jitter, and a persisted circuit breaker.
 */

/** HTTP failure carrying status and an optional server-provided retry delay. */
export class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   * @param {number|undefined} [retryAfterMs]
   */
  constructor(status, message, retryAfterMs) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Retryable: timeouts, network errors, 408/429 and 5xx (incl. Anthropic 529 overloaded).
 * Auth/validation errors (4xx) are not: retrying cannot fix them.
 * @param {unknown} err
 */
export function isRetryable(err) {
  if (err instanceof HttpError) return err.status === 408 || err.status === 429 || err.status >= 500;
  const name = /** @type {any} */ (err)?.name;
  return name === 'TimeoutError' || name === 'TypeError';
}

/**
 * Parses a `retry-after` header (seconds or HTTP date) into ms.
 * @param {string|null} value
 * @param {() => number} [now]
 * @returns {number|undefined}
 */
export function parseRetryAfter(value, now = Date.now) {
  if (!value) return undefined;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - now()) : undefined;
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs `fn` with up to `retries` extra attempts on retryable errors.
 * Delay = server `retry-after` if present, else equal-jitter exponential backoff.
 * @template T
 * @param {(attempt:number) => Promise<T>} fn
 * @param {{retries?:number, baseDelayMs?:number, maxDelayMs?:number,
 *          sleep?:(ms:number)=>Promise<void>, random?:()=>number}} [opts]
 * @returns {Promise<T>}
 */
export async function withRetry(fn, {
  retries = 2, baseDelayMs = 500, maxDelayMs = 8000, sleep = defaultSleep, random = Math.random,
} = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= retries || !isRetryable(err)) throw err;
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      const jittered = backoff / 2 + random() * (backoff / 2);
      const delay = /** @type {any} */ (err).retryAfterMs ?? jittered;
      await sleep(Math.min(delay, maxDelayMs));
    }
  }
}

/**
 * @typedef {{get:(key:string)=>Promise<any>, set:(key:string, value:any)=>Promise<void>}} KeyValueStore
 */

/**
 * Circuit breaker whose state survives MV3 service-worker restarts (via `store`).
 * Closed → Open after `failureThreshold` consecutive failures; after `cooldownMs`
 * one trial call is allowed (half-open). A failed trial re-opens it.
 */
export class CircuitBreaker {
  /**
   * @param {string} name
   * @param {{store: KeyValueStore, failureThreshold?: number, cooldownMs?: number, now?: () => number}} opts
   */
  constructor(name, { store, failureThreshold = 3, cooldownMs = 5 * 60_000, now = Date.now }) {
    this.key = `breaker:${name}`;
    this.store = store;
    this.failureThreshold = failureThreshold;
    this.cooldownMs = cooldownMs;
    this.now = now;
  }

  /** @returns {Promise<{failures:number, openedAt:number}>} */
  async state() {
    return (await this.store.get(this.key)) ?? { failures: 0, openedAt: 0 };
  }

  /** @returns {Promise<boolean>} True while calls must be short-circuited. */
  async isOpen() {
    const s = await this.state();
    return s.failures >= this.failureThreshold && this.now() - s.openedAt < this.cooldownMs;
  }

  async recordSuccess() {
    await this.store.set(this.key, { failures: 0, openedAt: 0 });
  }

  async recordFailure() {
    const s = await this.state();
    const failures = s.failures + 1;
    const openedAt = failures >= this.failureThreshold ? this.now() : s.openedAt;
    await this.store.set(this.key, { failures, openedAt });
  }
}
