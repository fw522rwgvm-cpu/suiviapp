import { z } from 'zod';
import type { OffProduct } from './off-product';

/**
 * The Open Food Facts boundary, and the ONLY module in this repository allowed
 * to import zod (D15, section 5).
 *
 * > Strict validation at both entry boundaries: JSON import and Open Food
 * > Facts responses.
 *
 * ## WHY ZOD HERE AND NOT IN THE IMPORTER
 *
 * Slice 2 declined zod for the export payload, with a reason that still holds:
 * that payload is not foreign. Its columns are already described by the
 * Drizzle objects the migrations are generated from, so a zod schema would be
 * a SECOND declaration of the same thing, maintained by hand, free to drift
 * from the first — inside the validator of the only safety net there is.
 *
 * This payload IS foreign. Nobody here controls its shape, it changes without
 * notice, and its own database is crowd-edited. That is the case zod was on
 * the dependency list for, and tests/conventions/zod-boundary.test.ts refuses
 * an import of it from anywhere else.
 *
 * ## WHAT THE PROBES FOUND, WHICH IS MOST OF WHY THIS FILE LOOKS LIKE THIS
 *
 * Eight requests to the live API on 13/09/2026. Observed, not read about:
 *
 *  1. A lookup answers HTTP 200 whether or not the product exists. "Not
 *     found" is `status: 0` in the body; the 404 is not the signal.
 *  2. `fields=` restricts down to individual nutriments.
 *  3. `nutriments_estimated` COMES BACK WHETHER OR NOT IT WAS ASKED FOR, and
 *     it is large. It holds values estimated from the ingredient list, and it
 *     is populated for products whose declared nutriments are missing. It is
 *     therefore the single most dangerous field in the response: reading it
 *     would fill in exactly the gaps that are supposed to divert the user to
 *     the form, with numbers nobody declared. IT IS NEVER READ, and a test
 *     hands the parser a response carrying nothing else to prove it.
 *  4. `brands` is a STRING on the product endpoint ("Nutella, Ferrero, Yum
 *     yum") and an ARRAY on the search endpoint (["Nutella"]).
 *  5. A search hit may carry only `energy-kj_100g` where the product endpoint
 *     supplies `energy-kcal_100g` — Open Food Facts computes it server-side.
 *  6. Search endpoints on the main host answer with an HTML holding page. A
 *     200 that is not JSON is a real, current state of this API, not a
 *     theoretical one.
 *  7. `fields=` DOES NOT behave the same on both endpoints. The product one
 *     restricts down to a single nutriment; the search one answers
 *     `"nutriments": null` if asked for a sub-field. So the two field lists
 *     are written separately in off-client.ts rather than shared, and this
 *     schema accepts an explicit null where a product carries no nutriments.
 *
 * ## THE ONE RULE THAT MATTERS MOST
 *
 * ABSENT MUST NEVER BECOME ZERO. `Number('')` is 0, `Number(null)` is 0,
 * `Number([])` is 0. Any of those slipping through turns "this product does
 * not declare its protein" into "this product has no protein" — plausible,
 * wrong, invisible, and it would send the user down the fast path instead of
 * the pre-filled form specs 8.5 requires. Every numeric field goes through
 * readNumber below, which returns null for all of them.
 */

/**
 * A nutriment value, as permissively as is safe.
 *
 * Numbers arrive as numbers most of the time and as strings some of the time,
 * and there is no way to know which from a schema. So the schema accepts
 * unknown and the narrowing happens in one place, where the traps are written
 * down.
 *
 * NOT COERCED BY ZOD. `z.coerce.number()` is exactly the shape of the bug
 * described above: it calls Number(), so an empty string becomes 0 and passes
 * validation as a perfectly good measurement.
 */
function readNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    // NaN and Infinity are not measurements. They reach a REAL column happily
    // and poison every total computed from it afterwards.
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    // THE EMPTY-STRING GATE, and it must come before Number(). Open Food Facts
    // returns '' for a field somebody cleared, and Number('') is 0.
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  // null, undefined, objects, arrays, booleans: not a measurement, and several
  // of them would survive Number().
  return null;
}

/**
 * A name or a brand, trimmed, with empty treated as absent.
 *
 * Empty and absent are the same thing to a reader and two different things in
 * a database. Absent is the honest one — the same rule food-writes.ts already
 * applies to a typed-in brand.
 */
function readText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * The brand, of which there may be several.
 *
 * The product endpoint sends a comma-separated string; the search endpoint
 * sends an array. Both are normalised to the FIRST entry, because `food.brand`
 * is one displayed line and "Nutella, Ferrero, Yum yum" is provenance rather
 * than a brand. The first is the one on the front of the packet, and the user
 * can correct it freely once copied (specs 8.5).
 */
function readBrand(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const text = readText(entry);
      if (text !== null) return text;
    }
    return null;
  }

  const text = readText(value);
  if (text === null) return null;
  const first = text.split(',')[0];
  return first === undefined ? null : readText(first);
}

/**
 * The nutriment block.
 *
 * `passthrough` rather than an exhaustive shape: Open Food Facts publishes
 * dozens of nutriments and adds more, and a strict object would reject a
 * perfectly good product for carrying a field about copper. The keys actually
 * read are listed in normaliseNutriments, and they are the only ones.
 */
const nutrimentsSchema = z.looseObject({});

/**
 * The fields a product carries, on either endpoint.
 *
 * Everything is optional. A response missing `product_name` is a product
 * without a name, not a broken response — specs 8.5 treats this data as
 * unreliable by default, and refusing the response would lose the product
 * where the specs ask to show it marked.
 *
 * `nutriments_estimated` IS ABSENT FROM THIS SCHEMA ON PURPOSE, and its
 * absence is the mechanism: a field that is not declared is a field that
 * cannot be read by accident later.
 */
const productFieldsSchema = z.looseObject({
  code: z.unknown().optional(),
  product_name: z.unknown().optional(),
  brands: z.unknown().optional(),
  /**
   * NULLISH, not merely optional, and that distinction was found by probing.
   *
   * The search endpoint answers `"nutriments": null` — an explicit null, not
   * an absent key — whenever `fields=` asks for a sub-field it does not
   * support. A schema accepting only `undefined` would reject the whole
   * response as malformed, which on screen is an empty result list for a
   * search that actually worked.
   */
  nutriments: nutrimentsSchema.nullish(),
});

/** The product endpoint: /api/v2/product/<barcode>.json */
const productResponseSchema = z.looseObject({
  status: z.unknown().optional(),
  product: productFieldsSchema.optional(),
});

/** The search endpoint: search.openfoodfacts.org/search?q=... */
const searchResponseSchema = z.looseObject({
  hits: z.array(productFieldsSchema).optional(),
  count: z.unknown().optional(),
  page_count: z.unknown().optional(),
});

type ProductFields = z.infer<typeof productFieldsSchema>;

/**
 * The four macros, read from the declared block and from nowhere else.
 *
 * Open Food Facts publishes `_100g` values for every product, including
 * liquids, whatever `nutrition_data_per` says — it computes them. So these are
 * always per 100, which is exactly the canonical form the schema stores, and
 * no conversion happens anywhere on this path.
 */
function normaliseNutriments(fields: ProductFields): {
  protein100: number | null;
  carbs100: number | null;
  fat100: number | null;
  kcal100: number | null;
} {
  // Deliberately NOT fields.nutriments_estimated, whatever this block is
  // missing. See the header: those are values computed from an ingredient
  // list, and using them would fill in the very gaps that are meant to divert
  // the user to a form where they can type what the packet actually says.
  const nutriments: Record<string, unknown> = fields.nutriments ?? {};

  return {
    protein100: readNumber(nutriments['proteins_100g']),
    carbs100: readNumber(nutriments['carbohydrates_100g']),
    fat100: readNumber(nutriments['fat_100g']),
    kcal100: readNumber(nutriments['energy-kcal_100g']),
  };
}

function toProduct(fields: ProductFields, barcode: string): OffProduct {
  return {
    barcode,
    name: readText(fields.product_name),
    brand: readBrand(fields.brands),
    ...normaliseNutriments(fields),
  };
}

/**
 * What a lookup produced. A value, never an exception (conventions section 4).
 *
 * `notFound` is a real answer rather than a failure: the barcode is simply not
 * in the database, and specs 8.5 has a path for it — offer to create a
 * personal food. `malformed` is different and must never be confused with a
 * network problem: the server answered, so the phone is online, and showing
 * an "hors ligne" banner would be a lie.
 */
export type ParsedLookup =
  | { outcome: 'product'; product: OffProduct }
  | { outcome: 'notFound' }
  | { outcome: 'malformed' };

/**
 * Reads a product lookup response.
 *
 * `status: 0` is how this API says "no such product", under an HTTP 200 —
 * observed, not assumed. A missing `product` object says the same thing, and
 * is treated the same way rather than as corruption: the two spellings mean
 * one fact.
 */
export function parseLookup(body: unknown, barcode: string): ParsedLookup {
  const parsed = productResponseSchema.safeParse(body);
  if (!parsed.success) return { outcome: 'malformed' };

  const status = readNumber(parsed.data.status);
  if (status === 0) return { outcome: 'notFound' };
  if (parsed.data.product === undefined) return { outcome: 'notFound' };

  return { outcome: 'product', product: toProduct(parsed.data.product, barcode) };
}

export type ParsedSearch =
  | { outcome: 'results'; products: OffProduct[] }
  | { outcome: 'malformed' };

/**
 * Reads a text search response.
 *
 * A hit with no usable barcode is DROPPED rather than kept, and that is the
 * one place this function throws anything away. A product is chosen from this
 * list by looking it up by barcode — that second call is what supplies the
 * kcal a search hit may lack — so a hit without one leads nowhere. Showing it
 * would be showing a row that cannot be tapped.
 */
export function parseSearch(body: unknown): ParsedSearch {
  const parsed = searchResponseSchema.safeParse(body);
  if (!parsed.success) return { outcome: 'malformed' };

  const hits = parsed.data.hits ?? [];
  const products: OffProduct[] = [];

  for (const hit of hits) {
    const barcode = readText(hit.code);
    if (barcode === null) continue;
    products.push(toProduct(hit, barcode));
  }

  return { outcome: 'results', products };
}

/**
 * Reads a product back out of the cache.
 *
 * THE CACHE IS A BOUNDARY TOO, in time rather than in space: a row written by
 * an older binary outlives it, and the normalised shape is free to change
 * between the two. So what comes out is validated exactly like what comes off
 * the network, and a row that no longer fits is reported as unreadable — the
 * caller then treats it as a miss and refetches. The cache is rebuildable;
 * that is its whole licence.
 */
const cachedProductSchema = z.object({
  barcode: z.string(),
  name: z.string().nullable(),
  brand: z.string().nullable(),
  protein100: z.number().finite().nullable(),
  carbs100: z.number().finite().nullable(),
  fat100: z.number().finite().nullable(),
  kcal100: z.number().finite().nullable(),
});

export function parseCachedProduct(payload: string): OffProduct | null {
  let body: unknown;
  try {
    body = JSON.parse(payload);
  } catch {
    // A payload that is not JSON at all. Same answer as one that no longer
    // fits: the row is unusable, and unusable means absent.
    return null;
  }

  const parsed = cachedProductSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

/** What goes into off_cache.payload. The inverse of parseCachedProduct. */
export function serialiseProduct(product: OffProduct): string {
  return JSON.stringify(product);
}
