import { describe, expect, it } from 'vitest';
import {
  createOffClient,
  LOOKUP_HOST,
  SEARCH_HOST,
  USER_AGENT,
  type OffClient,
  type SuspensionStore,
} from '../../src/features/nutrition/off/off-client';
import {
  DEFAULT_SUSPENSION_MS,
  RATE_LIMITS,
} from '../../src/features/nutrition/off/rate-limit';

/**
 * The client, exercised against a fake fetch (D15).
 *
 * Every dependency is injected — fetch, the clock, the suspension store — so
 * none of this touches the network, waits for a timeout, or needs a phone. The
 * same reasoning that makes the access layer take its database as an argument.
 *
 * WHAT IS WORTH TESTING HERE is the taxonomy of failures, because that is what
 * D11 legislates and what nothing on screen can distinguish. An offline banner
 * shown for a malformed response looks exactly like an offline banner shown
 * for a real network failure — to the user, and to whoever is debugging it.
 */

const T0 = 1_789_000_000_000;

interface Harness {
  client: OffClient;
  calls: string[];
  headers: (Record<string, string> | undefined)[];
  suspension: SuspensionStore & { value: number | null };
  setClock: (at: number) => void;
}

function harness(responder: (url: string, call: number) => Response | Error): Harness {
  const calls: string[] = [];
  const headers: (Record<string, string> | undefined)[] = [];
  let clock = T0;
  const store = {
    value: null as number | null,
    read() {
      return this.value;
    },
    write(untilMs: number) {
      this.value = untilMs;
    },
  };

  const client = createOffClient({
    now: () => clock,
    suspension: store,
    // No real delay: the single retry must not cost the suite a quarter second.
    delay: () => Promise.resolve(),
    fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push(String(url));
      headers.push(init?.headers as Record<string, string> | undefined);
      const outcome = responder(String(url), calls.length);
      if (outcome instanceof Error) throw outcome;
      return outcome;
    }) as unknown as typeof globalThis.fetch,
  });

  return { client, calls, headers, suspension: store, setClock: (at) => (clock = at) };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

const FOUND = {
  status: 1,
  product: {
    code: '3017620422003',
    product_name: 'Nutella',
    brands: 'Nutella, Ferrero',
    nutriments: {
      proteins_100g: 6.3,
      carbohydrates_100g: 57.5,
      fat_100g: 30.9,
      'energy-kcal_100g': 539,
    },
  },
};

describe('what a lookup asks for', () => {
  it('sends the compulsory identification header', async () => {
    // D11 makes it compulsory. It is not a secret: sent in clear, to a public
    // server, authorising nothing — see the note in off-client.ts.
    const h = harness(() => json(FOUND));
    await h.client.lookup('3017620422003');

    expect(h.headers[0]?.['User-Agent']).toBe(USER_AGENT);
    // The repository, never an email address: a public repo is free spam.
    expect(USER_AGENT).toContain('https://github.com/');
    expect(USER_AGENT).not.toContain('@');
  });

  it('restricts the fields it asks for, as D11 requires', async () => {
    const h = harness(() => json(FOUND));
    await h.client.lookup('3017620422003');

    const url = h.calls[0] ?? '';
    expect(url).toContain(`${LOOKUP_HOST}/api/v2/product/3017620422003.json`);
    expect(url).toContain('fields=');
    expect(url).toContain('nutriments.energy-kcal_100g');
    // Asking for the whole block would drag in everything the API has.
    expect(url).not.toMatch(/fields=[^&]*nutriments(?!\.)/);
  });

  it('escapes what it puts in the path', async () => {
    // A scanner is hardware and its output is not trusted to be digits.
    const h = harness(() => json({ status: 0 }));
    await h.client.lookup('../../etc/passwd');

    expect(h.calls[0]).toContain(encodeURIComponent('../../etc/passwd'));
  });

  it('searches on the OTHER host, which is where text search actually works', async () => {
    // Observed 13/09/2026: cgi/search.pl answers with an HTML holding page and
    // /api/v2/search does no full-text search. This is the one that does.
    const h = harness(() => json({ hits: [] }));
    await h.client.search('nutella');

    expect(h.calls[0]).toContain(`${SEARCH_HOST}/search?q=nutella`);
    // And it CANNOT restrict inside nutriments — asked for a sub-field it
    // answers null for the whole block — so the block is asked for whole.
    expect(h.calls[0]).toContain('fields=code,product_name,brands,nutriments');
  });
});

describe('the five outcomes, which nothing on screen can tell apart', () => {
  it('reads a product', async () => {
    const h = harness(() => json(FOUND));
    const outcome = await h.client.lookup('3017620422003');

    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.value.name).toBe('Nutella');
    expect(outcome.value.kcal100).toBe(539);
  });

  it('reads status 0 under an HTTP 200 as not found', async () => {
    const h = harness(() => json({ status: 0, status_verbose: 'no code' }));

    expect(await h.client.lookup('0000000000017')).toEqual({ status: 'notFound' });
  });

  it('reads a refused connection as offline', async () => {
    const h = harness(() => new TypeError('Network request failed'));

    expect(await h.client.lookup('123')).toEqual({ status: 'offline' });
  });

  it('reads our own abort as offline', async () => {
    const abort = new Error('Aborted');
    abort.name = 'AbortError';
    const h = harness(() => abort);

    expect(await h.client.lookup('123')).toEqual({ status: 'offline' });
  });

  it('reads an HTML holding page as badResponse, NEVER as offline', async () => {
    // THE DISTINCTION D11 MAKES AND A CARELESS CATCH ERASES. The server
    // answered, so the phone is online; an "hors ligne" banner here would be a
    // lie the user has no way to check. And this is a real current state of
    // two of this API's own endpoints, not a hypothetical.
    const h = harness(
      () =>
        new Response('<!DOCTYPE html><html>Page temporarily unavailable</html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
    );

    expect(await h.client.lookup('123')).toEqual({ status: 'badResponse' });
  });

  it('reads a 500 as badResponse too', async () => {
    const h = harness(() => json({ error: 'boom' }, 500));

    expect(await h.client.lookup('123')).toEqual({ status: 'badResponse' });
  });
});

describe('a 429 is not a network failure', () => {
  it('suspends, and PERSISTS the suspension', async () => {
    // The half that has to survive being killed: the server has said stop, and
    // an application that restarts and starts again is how an IP gets banned.
    const h = harness(() => json({ error: 'rate limited' }, 429));

    const outcome = await h.client.lookup('123');

    expect(outcome).toEqual({
      status: 'throttled',
      retryAtMs: T0 + DEFAULT_SUSPENSION_MS,
      source: 'server',
    });
    // Written before the outcome was returned, because the application can be
    // killed between the two.
    expect(h.suspension.value).toBe(T0 + DEFAULT_SUSPENSION_MS);
  });

  it('honours Retry-After when the server sends one', async () => {
    const h = harness(() => json({}, 429, { 'Retry-After': '600' }));
    await h.client.lookup('123');

    expect(h.suspension.value).toBe(T0 + 600_000);
  });

  it('is NEVER retried — retrying a 429 is what gets you banned', async () => {
    const h = harness(() => json({}, 429));
    await h.client.lookup('123');

    expect(h.calls).toHaveLength(1);
  });

  it('refuses the next call from the stored suspension, without asking the network', async () => {
    const h = harness((_url, call) => (call === 1 ? json({}, 429) : json(FOUND)));

    await h.client.lookup('123');
    const second = await h.client.lookup('456');

    expect(second.status).toBe('throttled');
    // The point: no request left. A suspension that still let calls through
    // would protect nothing at all.
    expect(h.calls).toHaveLength(1);
  });

  it('lets calls through again once the suspension lapses', async () => {
    const h = harness((_url, call) => (call === 1 ? json({}, 429) : json(FOUND)));
    await h.client.lookup('123');

    h.setClock(T0 + DEFAULT_SUSPENSION_MS + 1);
    expect((await h.client.lookup('456')).status).toBe('ok');
  });
});

describe('our own window is a different fact from the server refusing', () => {
  it('holds back once the minute budget is spent, and says so quietly', async () => {
    const h = harness(() => json({ status: 0 }));

    for (let index = 0; index < RATE_LIMITS.lookup; index += 1) {
      await h.client.lookup(`${index}`);
    }
    const held = await h.client.lookup('too-many');

    expect(held.status).toBe('throttled');
    if (held.status !== 'throttled') return;
    // D11 reserves the loud message for an overrun REPORTED BY THE SERVER.
    // This one is our own estimate, nobody did anything wrong, and the screen
    // must stay discreet about it.
    expect(held.source).toBe('window');
    expect(h.calls).toHaveLength(RATE_LIMITS.lookup);
  });

  it('does NOT persist a suspension for its own window', async () => {
    // Writing one would outlive the minute that justified it, and would then
    // be read back after a restart as though the server had refused.
    const h = harness(() => json({ status: 0 }));
    for (let index = 0; index <= RATE_LIMITS.lookup; index += 1) {
      await h.client.lookup(`${index}`);
    }

    expect(h.suspension.value).toBeNull();
  });

  it('keeps searching possible when lookups are spent, and the reverse', async () => {
    const h = harness(() => json({ hits: [] }));
    for (let index = 0; index < RATE_LIMITS.lookup; index += 1) {
      await h.client.lookup(`${index}`);
    }

    // Being unable to scan because the search ran too often would be the wrong
    // thing to break, and the limits differ anyway.
    expect((await h.client.search('pain')).status).toBe('ok');
  });
});

describe('the single retry, and what it is spent on', () => {
  it('retries a refused connection once', async () => {
    // A refusal cost nothing and is the failure most likely to be transient.
    const h = harness((_url, call) =>
      call === 1 ? new TypeError('Network request failed') : json(FOUND),
    );

    expect((await h.client.lookup('123')).status).toBe('ok');
    expect(h.calls).toHaveLength(2);
  });

  it('gives up after the second refusal', async () => {
    const h = harness(() => new TypeError('Network request failed'));

    expect(await h.client.lookup('123')).toEqual({ status: 'offline' });
    expect(h.calls).toHaveLength(2);
  });

  it('does NOT retry a timeout', async () => {
    // A timeout has already been given every millisecond we were willing to
    // wait. Retrying doubles a wait already judged too long, on a path specs
    // 8.5 budgets at five seconds — in a shop, with the phone in one hand.
    const abort = new Error('Aborted');
    abort.name = 'AbortError';
    const h = harness(() => abort);

    await h.client.lookup('123');
    expect(h.calls).toHaveLength(1);
  });

  it('does NOT retry a bad response', async () => {
    // The server answered. Asking the same question again gets the same
    // answer, and spends a slot doing it.
    const h = harness(() => json({ error: 'boom' }, 500));

    await h.client.lookup('123');
    expect(h.calls).toHaveLength(1);
  });

  it('counts BOTH attempts against the budget', async () => {
    // Not counting a request that was sent is how a flaky network turns into a
    // ban: the server saw it, whatever we made of the answer.
    const h = harness((_url, call) =>
      call % 2 === 1 ? new TypeError('failed') : json(FOUND),
    );

    // Each lookup here costs two slots, so the budget runs out twice as fast.
    for (let index = 0; index < RATE_LIMITS.lookup / 2; index += 1) {
      await h.client.lookup(`${index}`);
    }
    const held = await h.client.lookup('next');

    expect(held.status).toBe('throttled');
  });
});

describe('searching', () => {
  it('reads hits into products', async () => {
    const h = harness(() =>
      json({
        hits: [
          { code: '1', product_name: 'Pain', brands: ['Harrys'] },
          { code: '2', product_name: 'Lait', brands: null },
        ],
      }),
    );

    const outcome = await h.client.search('pa');
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.value.map((product) => product.name)).toEqual(['Pain', 'Lait']);
  });

  it('reads no results as an empty list, not as a failure', async () => {
    const h = harness(() => json({ hits: [], count: 0 }));

    expect(await h.client.search('xyzzy')).toEqual({ status: 'ok', value: [] });
  });

  it('reads the holding page as badResponse', async () => {
    const h = harness(
      () => new Response('<!DOCTYPE html>', { status: 200, headers: {} }),
    );

    expect((await h.client.search('pain')).status).toBe('badResponse');
  });
});
