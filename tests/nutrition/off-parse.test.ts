import { describe, expect, it } from 'vitest';
import {
  parseCachedProduct,
  parseLookup,
  parseSearch,
  serialiseProduct,
} from '../../src/features/nutrition/off/off-parse';
import {
  isCompleteProduct,
  isImpossibleEnergy,
  missingMacroLabels,
  type OffProduct,
} from '../../src/features/nutrition/off/off-product';

/**
 * The Open Food Facts boundary (D15: "strict validation at both entry
 * boundaries").
 *
 * The shapes below are not invented. They are cut down from eight real
 * responses taken on 13/09/2026, and every oddity they exercise was observed
 * rather than imagined: HTTP 200 on a missing product, `brands` as a string on
 * one endpoint and an array on another, a search hit carrying only kilojoules,
 * and `nutriments_estimated` arriving unasked.
 *
 * WHAT IS WORTH TESTING HERE is not that a well-formed response parses — that
 * shows on screen the first time anyone scans something. It is every way a
 * response can be wrong while looking right, because those produce a food with
 * plausible numbers nobody declared.
 */

/** The real Nutella response, trimmed to the fields the parser reads. */
const NUTELLA = {
  code: '3017620422003',
  status: 1,
  status_verbose: 'product found',
  product: {
    code: '3017620422003',
    product_name: 'Nutella',
    brands: 'Nutella, Ferrero, Yum yum',
    nutriments: {
      proteins_100g: 6.3,
      carbohydrates_100g: 57.5,
      fat_100g: 30.9,
      'energy-kcal_100g': 539,
      'energy-kj_100g': 2252,
      salt_100g: 0.107,
      'saturated-fat_100g': 10.6,
    },
  },
};

describe('reading a product lookup', () => {
  it('reads the four macros, the name and the first brand', () => {
    const parsed = parseLookup(NUTELLA, '3017620422003');

    expect(parsed.outcome).toBe('product');
    if (parsed.outcome !== 'product') return;
    expect(parsed.product).toEqual({
      barcode: '3017620422003',
      name: 'Nutella',
      // "Nutella, Ferrero, Yum yum" is provenance, not a brand. The first is
      // the one on the front of the packet, and it stays freely correctable.
      brand: 'Nutella',
      protein100: 6.3,
      carbs100: 57.5,
      fat100: 30.9,
      kcal100: 539,
    });
    expect(isCompleteProduct(parsed.product)).toBe(true);
  });

  it('keeps the barcode ASKED FOR, not the one echoed back', () => {
    // Observed: a lookup for 0000000000017 answers with code "00000017". The
    // cache is keyed on this value, so keying on the echo would store rows
    // under a code the scanner never produces and never hit.
    const parsed = parseLookup(
      { status: 1, product: { code: '00000017', product_name: 'x' } },
      '0000000000017',
    );

    expect(parsed.outcome).toBe('product');
    if (parsed.outcome !== 'product') return;
    expect(parsed.product.barcode).toBe('0000000000017');
  });

  it('reads status 0 as "not found", under an HTTP 200', () => {
    // The 404 is NOT the signal. Observed: an invalid code answers 200 with
    // this body, and a parser keyed on the HTTP status would report a product.
    expect(
      parseLookup(
        { code: '00000017', status: 0, status_verbose: 'no code or invalid code' },
        '0000000000017',
      ),
    ).toEqual({ outcome: 'notFound' });
  });

  it('reads a missing product object as "not found" too', () => {
    expect(parseLookup({ status: 1 }, '123')).toEqual({ outcome: 'notFound' });
  });

  it('reports an HTML holding page as malformed, NEVER as offline', () => {
    // Observed on two of this API's own endpoints: a 200 whose body is an HTML
    // "Page temporarily unavailable". The distinction matters on screen —
    // the server answered, so the phone is online, and an "hors ligne" banner
    // here would be a lie the user cannot check.
    expect(parseLookup('<!DOCTYPE html><html>...', '123')).toEqual({
      outcome: 'malformed',
    });
    expect(parseLookup(null, '123')).toEqual({ outcome: 'malformed' });
    expect(parseLookup(42, '123')).toEqual({ outcome: 'malformed' });
  });
});

describe('absent must never become zero', () => {
  /**
   * THE FAMILY OF BUGS THIS WHOLE MODULE EXISTS TO PREVENT.
   *
   * Every one of these values becomes 0 under Number(), which is what
   * z.coerce.number() calls. A product that does not declare its protein would
   * become a product with no protein — and worse than being wrong, it would be
   * COMPLETE, sending the user down the fast path instead of the pre-filled
   * form specs 8.5 requires for a missing macro.
   */
  function proteinOf(raw: unknown): number | null {
    const parsed = parseLookup(
      { status: 1, product: { product_name: 'x', nutriments: { proteins_100g: raw } } },
      '123',
    );
    return parsed.outcome === 'product' ? parsed.product.protein100 : null;
  }

  it.each([
    ['an empty string', ''],
    ['a blank string', '   '],
    ['null', null],
    ['undefined', undefined],
    ['an empty array', []],
    ['an object', {}],
    ['false', false],
    ['a word', 'unknown'],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('reads %s as absent, not as zero', (_label, raw) => {
    expect(proteinOf(raw)).toBeNull();
  });

  it('still reads a real zero as zero', () => {
    // The other half, and the one that would be lost by an over-eager guard:
    // a product genuinely declaring no fat is not a product missing its fat.
    expect(proteinOf(0)).toBe(0);
    expect(proteinOf('0')).toBe(0);
  });

  it('reads a numeric string, which is how some products arrive', () => {
    expect(proteinOf('6.3')).toBe(6.3);
    expect(proteinOf(' 6.3 ')).toBe(6.3);
  });

  it('diverts to the form when a single macro is missing', () => {
    const parsed = parseLookup(
      {
        status: 1,
        product: {
          product_name: 'Crème fraîche',
          nutriments: {
            proteins_100g: 2,
            carbohydrates_100g: 2.3,
            fat_100g: 41,
            // No energy-kcal_100g: observed on a real search hit, which
            // carried only energy-kj_100g.
            'energy-kj_100g': 1590,
          },
        },
      },
      '5000169045886',
    );

    expect(parsed.outcome).toBe('product');
    if (parsed.outcome !== 'product') return;
    // Not converted from kilojoules: specs 5.1 keeps a source value as it
    // stands, and 1590 / 4.184 would be a number this application invented.
    expect(parsed.product.kcal100).toBeNull();
    expect(isCompleteProduct(parsed.product)).toBe(false);
    expect(missingMacroLabels(parsed.product)).toEqual(['calories']);
  });

  it('diverts to the form when the product has no name', () => {
    const parsed = parseLookup(
      {
        status: 1,
        product: {
          nutriments: {
            proteins_100g: 1,
            carbohydrates_100g: 1,
            fat_100g: 1,
            'energy-kcal_100g': 20,
          },
        },
      },
      '123',
    );

    expect(parsed.outcome).toBe('product');
    if (parsed.outcome !== 'product') return;
    expect(parsed.product.name).toBeNull();
    // food.name is NOT NULL and so is journal_entry.name: a nameless product
    // cannot be written at all, so it takes the same detour.
    expect(isCompleteProduct(parsed.product)).toBe(false);
  });
});

describe('nutriments_estimated is never read', () => {
  /**
   * THE MOST DANGEROUS FIELD IN THE RESPONSE.
   *
   * Observed on 13/09/2026: it comes back whether or not it was asked for,
   * even when `fields=` names a single nutriment. It holds values ESTIMATED
   * FROM THE INGREDIENT LIST, and it is populated precisely for products whose
   * declared nutriments are missing.
   *
   * Reading it would fill in exactly the gaps that are supposed to divert the
   * user to the form, with numbers nobody declared and no label agrees with.
   * It is left out of the schema so that it cannot be read by accident, and
   * this is the assertion that says so out loud.
   */
  it('leaves macros absent even when estimates are sitting right there', () => {
    const parsed = parseLookup(
      {
        status: 1,
        product: {
          product_name: 'Produit sans valeurs declarees',
          nutriments: {},
          nutriments_estimated: {
            proteins_100g: 6.3,
            carbohydrates_100g: 57.5,
            fat_100g: 30.9,
            'energy-kcal_100g': 539,
          },
        },
      },
      '123',
    );

    expect(parsed.outcome).toBe('product');
    if (parsed.outcome !== 'product') return;
    expect(parsed.product.protein100).toBeNull();
    expect(parsed.product.carbs100).toBeNull();
    expect(parsed.product.fat100).toBeNull();
    expect(parsed.product.kcal100).toBeNull();
    // Which is what sends this product to the pre-filled form, where the user
    // types what the packet says.
    expect(isCompleteProduct(parsed.product)).toBe(false);
  });

  it('reads the declared block when there is one, estimates notwithstanding', () => {
    const parsed = parseLookup(
      {
        status: 1,
        product: {
          product_name: 'x',
          nutriments: { proteins_100g: 2 },
          nutriments_estimated: { proteins_100g: 99 },
        },
      },
      '123',
    );

    expect(parsed.outcome).toBe('product');
    if (parsed.outcome !== 'product') return;
    expect(parsed.product.protein100).toBe(2);
  });
});

describe('reading a search response', () => {
  /** Cut down from the real search.openfoodfacts.org answer for "creme fraiche". */
  const SEARCH = {
    hits: [
      {
        code: '5000169045886',
        product_name: 'French Crème fraîche',
        // AN ARRAY here, where the product endpoint sends a string.
        brands: ['Waitrose'],
        nutriments: {
          proteins_100g: 2,
          carbohydrates_100g: 2.3,
          fat_100g: 41,
          'energy-kj_100g': 1590,
        },
      },
      {
        code: '9002682143465',
        product_name: 'Creme fraiche',
        brands: ['Ich bin Österreich'],
        nutriments: {
          proteins_100g: 2.4,
          carbohydrates_100g: 3.2,
          fat_100g: 30,
          'energy-kcal_100g': 292,
        },
      },
    ],
    count: 316,
    page: 1,
  };

  it('reads both brand spellings without either endpoint knowing about it', () => {
    const parsed = parseSearch(SEARCH);

    expect(parsed.outcome).toBe('results');
    if (parsed.outcome !== 'results') return;
    expect(parsed.products.map((product) => product.brand)).toEqual([
      'Waitrose',
      'Ich bin Österreich',
    ]);
  });

  it('leaves a hit incomplete rather than filling it in', () => {
    // Observed: the first of these two really does lack energy-kcal_100g. It
    // is not dropped and not repaired — choosing it triggers a lookup by
    // barcode, and THAT is what supplies the kcal, because Open Food Facts
    // computes it server-side on the product endpoint.
    const parsed = parseSearch(SEARCH);

    expect(parsed.outcome).toBe('results');
    if (parsed.outcome !== 'results') return;
    expect(parsed.products[0]?.kcal100).toBeNull();
    expect(parsed.products[1]?.kcal100).toBe(292);
  });

  it('drops a hit with no barcode, because it leads nowhere', () => {
    const parsed = parseSearch({
      hits: [{ product_name: 'Sans code' }, { code: '123', product_name: 'Avec code' }],
    });

    expect(parsed.outcome).toBe('results');
    if (parsed.outcome !== 'results') return;
    expect(parsed.products.map((product) => product.barcode)).toEqual(['123']);
  });

  it('reads an empty result set as empty, not as a failure', () => {
    expect(parseSearch({ hits: [], count: 0 })).toEqual({
      outcome: 'results',
      products: [],
    });
    expect(parseSearch({ count: 0 })).toEqual({ outcome: 'results', products: [] });
  });

  it('reports an HTML holding page as malformed', () => {
    // The observed state of cgi/search.pl on 13/09/2026.
    expect(parseSearch('<!DOCTYPE html><html>').outcome).toBe('malformed');
    expect(parseSearch({ hits: 'not an array' }).outcome).toBe('malformed');
  });
});

describe('the cache is a boundary too', () => {
  const PRODUCT: OffProduct = {
    barcode: '3017620422003',
    name: 'Nutella',
    brand: 'Nutella',
    protein100: 6.3,
    carbs100: 57.5,
    fat100: 30.9,
    kcal100: 539,
  };

  it('round-trips a product through the payload column', () => {
    expect(parseCachedProduct(serialiseProduct(PRODUCT))).toEqual(PRODUCT);
  });

  it('keeps an absent macro absent across the round trip', () => {
    // The property that matters most: a cache that turned null into 0 on the
    // way back would resurrect the very bug the parser exists to prevent, one
    // binary upgrade later.
    const incomplete: OffProduct = { ...PRODUCT, kcal100: null, name: null };
    expect(parseCachedProduct(serialiseProduct(incomplete))).toEqual(incomplete);
  });

  it('treats a row it can no longer read as absent', () => {
    // A row written by an older binary, under a shape that has since changed.
    // Unreadable means a cache miss and a refetch, never a crash and never a
    // half-built product: the cache is rebuildable, which is its whole licence.
    expect(parseCachedProduct('not json at all')).toBeNull();
    expect(parseCachedProduct('{}')).toBeNull();
    expect(parseCachedProduct('{"barcode":"1","name":"x"}')).toBeNull();
    // A macro stored as a string rather than a number: shape drift, not data.
    expect(
      parseCachedProduct(JSON.stringify({ ...PRODUCT, protein100: '6.3' })),
    ).toBeNull();
  });
});

describe('physically impossible energy', () => {
  it('marks beyond 900 kcal per 100, and leaves 900 itself alone', () => {
    // Pure fat is 900 exactly. A warning that fires on olive oil is a warning
    // nobody reads twice.
    expect(isImpossibleEnergy(901)).toBe(true);
    expect(isImpossibleEnergy(900)).toBe(false);
    expect(isImpossibleEnergy(899.9)).toBe(false);
  });

  it('says nothing about a missing value', () => {
    // Absent is the form's problem, not this one's: a missing kcal already
    // diverts to the pre-filled form, and flagging it as impossible on top
    // would be two messages about one fact.
    expect(isImpossibleEnergy(null)).toBe(false);
    expect(isImpossibleEnergy(Number.NaN)).toBe(false);
  });
});
