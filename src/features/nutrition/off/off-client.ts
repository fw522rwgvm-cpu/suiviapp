import { parseLookup, parseSearch } from './off-parse';
import type { OffProduct } from './off-product';
import {
  decide,
  emptyCallLog,
  record,
  suspensionUntil,
  type CallLog,
  type OffRequestKind,
} from './rate-limit';

/**
 * The Open Food Facts client (D11, specs 8.5).
 *
 * ## THE IDENTIFICATION HEADER IS NOT A SECRET
 *
 * D11 requires one and D15 forbids secrets in the repository, so it is worth
 * saying plainly why there is no contradiction. A secret is a value whose
 * disclosure lets someone act as you. This one is sent IN CLEAR, ON EVERY
 * REQUEST, TO A PUBLIC SERVER, WITH NO AUTHENTICATION. It authorises nothing,
 * anyone can forge it, and forging it grants no access — Open Food Facts has
 * no read API key at all. It is a courtesy that lets them contact whoever is
 * responsible for odd traffic.
 *
 * The contact is the REPOSITORY URL rather than an email address. Also not a
 * secret, but an address in a public repository is free spam, and the issues
 * page is a real way to reach the author.
 *
 * ## TWO HOSTS, WHICH IS NOT AN IMPLEMENTATION DETAIL
 *
 * Probed on 13/09/2026, and this is the shape of the API today rather than
 * what its documentation implies:
 *
 *  - lookups go to world.openfoodfacts.org, which works;
 *  - `cgi/search.pl`, the historic text search, answers with an HTML holding
 *    page;
 *  - `/api/v2/search` answers HTML on some queries and does no full-text
 *    search anyway — it filters by tag;
 *  - `search.openfoodfacts.org/search?q=` works and returns clean JSON.
 *
 * So text search lives on a different host from product lookup. The two
 * counters stay separate regardless, because D11 gives them different limits
 * and because exhausting one must not disable the other.
 *
 * And `fields=` behaves differently on each: the product endpoint restricts
 * down to a single nutriment, the search endpoint answers `nutriments: null`
 * if asked for a sub-field. Hence two field lists rather than one shared
 * constant — a shared one would silently cost the search its macros.
 *
 * ## NOTHING HERE THROWS
 *
 * > An expected error (product not found, network absent, quota exceeded) is a
 * > return value, not an exception. (Conventions, section 4)
 *
 * Five outcomes, and the distinction that matters most is between `offline`
 * and `badResponse`: a server that answered with rubbish proves the phone IS
 * online, so showing an "hors ligne" banner would be a lie the user cannot
 * check. D11 makes the same distinction one level up — "an overrun is not a
 * network failure".
 *
 * ## EVERY DEPENDENCY IS INJECTED
 *
 * fetch, the clock and the suspension store all arrive as parameters, so the
 * whole of this module runs in Node against a fake — the same reason the
 * access layer takes its database as an argument (D15). off-gateway.ts is the
 * only place that names the real ones.
 */

export const LOOKUP_HOST = 'https://world.openfoodfacts.org';
export const SEARCH_HOST = 'https://search.openfoodfacts.org';

/** Compulsory (D11). Not a secret — see the header. */
export const USER_AGENT = 'Suivi/0.1.0 (https://github.com/fw522rwgvm-cpu/suiviapp)';

/**
 * Restricted explicitly, as D11 requires.
 *
 * The four macros and nothing else. Note this does NOT stop
 * `nutriments_estimated` coming back — it arrives whatever is asked for — which
 * is why off-parse.ts refuses to read it rather than relying on not receiving
 * it.
 */
const LOOKUP_FIELDS = [
  'code',
  'product_name',
  'brands',
  'nutriments.proteins_100g',
  'nutriments.carbohydrates_100g',
  'nutriments.fat_100g',
  'nutriments.energy-kcal_100g',
].join(',');

/**
 * The search endpoint cannot restrict inside `nutriments`: asked for a
 * sub-field it returns null for the whole block. So the block is requested
 * whole, and the kcal shown in a result row are a bonus rather than a promise —
 * choosing a row looks the product up by barcode, and that is what supplies
 * the macros a food is built from.
 */
const SEARCH_FIELDS = ['code', 'product_name', 'brands', 'nutriments'].join(',');

/** Enough results to choose from, few enough to read on a phone. */
export const SEARCH_PAGE_SIZE = 20;

/**
 * D11 asks for a short timeout. Five seconds is short against the 5-second
 * target of specs 8.5 and generous against the sub-second answers observed.
 *
 * A request that times out is NOT retried — see fetchOnce. Flagged as a
 * setting rather than a law: it is one number, and the way to know it is wrong
 * is to use the application in a shop.
 */
export const REQUEST_TIMEOUT_MS = 5000;

/** A gap before the single retry, so an instant failure is not hammered. */
const RETRY_DELAY_MS = 250;

export type OffOutcome<T> =
  | { status: 'ok'; value: T }
  /** The barcode is not in the database. An answer, not a failure. */
  | { status: 'notFound' }
  /** No answer at all: the request was refused or it timed out. */
  | { status: 'offline' }
  /**
   * Rate-limited, and the SOURCE is part of the answer.
   *
   * D11 reserves the loud message for an overrun "reported by the server":
   * that is the one case in the whole application where a message is not
   * discreet, because ignoring it risks a ban by IP. Our own preventive window
   * is a different fact — nobody did anything wrong and there is nothing to
   * decide — so it stays discreet. Collapsing the two into one refusal would
   * mean either shouting at a user who scanned quickly, or whispering when the
   * server has already said stop.
   */
  | { status: 'throttled'; retryAtMs: number; source: 'server' | 'window' }
  /** The server answered, and what it said was not usable. Never 'offline'. */
  | { status: 'badResponse' };

export interface SuspensionStore {
  read(): number | null;
  write(untilMs: number): void;
}

export interface OffClientDeps {
  fetchImpl: typeof globalThis.fetch;
  now: () => number;
  suspension: SuspensionStore;
  /** Injected so a test does not wait a quarter of a second, twice. */
  delay?: (ms: number) => Promise<void>;
}

export interface OffClient {
  lookup(barcode: string): Promise<OffOutcome<OffProduct>>;
  search(term: string): Promise<OffOutcome<OffProduct[]>>;
}

/** What one HTTP attempt produced, before any parsing. */
type Attempt =
  | { kind: 'body'; body: unknown }
  /** The SERVER said 429. The only throttle worth persisting. */
  | { kind: 'serverThrottled'; retryAfter: string | null }
  | { kind: 'httpError' }
  /** Refused outright — no route, DNS, connection refused. Worth one retry. */
  | { kind: 'refused' }
  /** The clock ran out. NOT worth a retry: see below. */
  | { kind: 'timedOut' };

/**
 * Whether a request even left, kept separate from what came back.
 *
 * Our own window refusing and the server refusing are two different facts, and
 * an earlier draft told them apart by whether a Retry-After header happened to
 * be present — which is a coincidence, not a distinction. Naming them makes
 * the difference structural, which matters because only one of them is worth
 * writing to the database and only one is worth interrupting the user over.
 */
type Dispatch =
  | { kind: 'sent'; attempt: Attempt }
  | { kind: 'heldBack'; retryAtMs: number };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createOffClient(deps: OffClientDeps): OffClient {
  const wait = deps.delay ?? sleep;
  /**
   * The sliding window, held in memory for the lifetime of the application.
   *
   * Deliberately not persisted: it expires in sixty seconds, and writing to
   * SQLite on every remote request to protect it would be a bad trade in both
   * directions. The SUSPENSION is the half that survives being killed, and it
   * lives in `setting` — see rate-limit.ts.
   */
  let log: CallLog = emptyCallLog();

  async function fetchOnce(url: string): Promise<Attempt> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await deps.fetchImpl(url, {
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      });

      if (response.status === 429) {
        return {
          kind: 'serverThrottled',
          retryAfter: response.headers.get('Retry-After'),
        };
      }
      if (!response.ok) return { kind: 'httpError' };

      // .json() throws on an HTML holding page, which is a real state of this
      // API rather than a hypothetical one. That is a bad response, not a
      // network failure: the server spoke.
      try {
        return { kind: 'body', body: await response.json() };
      } catch {
        return { kind: 'httpError' };
      }
    } catch (error) {
      // AbortError means our own timeout fired. Everything else — TypeError
      // from fetch, DNS, no route — is a refusal.
      const aborted = error instanceof Error && error.name === 'AbortError';
      return aborted ? { kind: 'timedOut' } : { kind: 'refused' };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * One attempt, plus at most one retry — and ONLY when the first was refused
   * outright.
   *
   * D11 allows "a single retry". Spending it on a timeout would be the wrong
   * choice: a timeout has already given the server every millisecond we were
   * willing to wait, so retrying doubles a wait already judged too long, on a
   * path specs 8.5 budgets at five seconds. A refusal, by contrast, cost
   * nothing and is the failure most likely to be transient.
   *
   * Both attempts are counted by the limiter, because both reached the server's
   * door. Not counting a request that was sent is how a flaky network turns
   * into a ban.
   */
  async function request(kind: OffRequestKind, url: string): Promise<Dispatch> {
    const decision = decide(log, kind, deps.now(), deps.suspension.read());
    if (!decision.allowed) {
      return { kind: 'heldBack', retryAtMs: decision.retryAtMs };
    }

    log = record(log, kind, deps.now());
    const first = await fetchOnce(url);
    if (first.kind !== 'refused') return { kind: 'sent', attempt: first };

    await wait(RETRY_DELAY_MS);
    log = record(log, kind, deps.now());
    return { kind: 'sent', attempt: await fetchOnce(url) };
  }

  /**
   * Turns anything that is not a usable body into an outcome.
   *
   * The suspension is written HERE, at the single place a server 429 is
   * recognised, so that no caller can forget to — and it is written BEFORE the
   * outcome is returned, because the application can be killed between the two
   * and the whole point of persisting it is to survive exactly that.
   */
  function toFailure(dispatch: Dispatch): OffOutcome<never> {
    if (dispatch.kind === 'heldBack') {
      // Our own window. Nothing is written: the server has not refused
      // anything, and storing a suspension it never asked for would outlive
      // the minute that justified it.
      return { status: 'throttled', retryAtMs: dispatch.retryAtMs, source: 'window' };
    }

    switch (dispatch.attempt.kind) {
      case 'serverThrottled': {
        const until = suspensionUntil(dispatch.attempt.retryAfter, deps.now());
        deps.suspension.write(until);
        return { status: 'throttled', retryAtMs: until, source: 'server' };
      }
      case 'refused':
      case 'timedOut':
        return { status: 'offline' };
      case 'httpError':
      case 'body':
        return { status: 'badResponse' };
    }
  }

  return {
    async lookup(barcode: string): Promise<OffOutcome<OffProduct>> {
      const url = `${LOOKUP_HOST}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${LOOKUP_FIELDS}`;
      const dispatch = await request('lookup', url);
      if (dispatch.kind !== 'sent' || dispatch.attempt.kind !== 'body') {
        return toFailure(dispatch);
      }

      // The barcode we ASKED FOR is carried through, because the API
      // normalises what it is given and the cache is keyed on the question.
      const parsed = parseLookup(dispatch.attempt.body, barcode);
      switch (parsed.outcome) {
        case 'product':
          return { status: 'ok', value: parsed.product };
        case 'notFound':
          return { status: 'notFound' };
        case 'malformed':
          return { status: 'badResponse' };
      }
    },

    async search(term: string): Promise<OffOutcome<OffProduct[]>> {
      const url = `${SEARCH_HOST}/search?q=${encodeURIComponent(term)}&page_size=${SEARCH_PAGE_SIZE}&fields=${SEARCH_FIELDS}`;
      const dispatch = await request('search', url);
      if (dispatch.kind !== 'sent' || dispatch.attempt.kind !== 'body') {
        return toFailure(dispatch);
      }

      const parsed = parseSearch(dispatch.attempt.body);
      return parsed.outcome === 'results'
        ? { status: 'ok', value: parsed.products }
        : { status: 'badResponse' };
    },
  };
}
