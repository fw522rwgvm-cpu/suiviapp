import { describe, expect, it } from 'vitest';
import { scoreFood, searchFoods } from '../../src/features/nutrition/domain/food-search';

/**
 * The ranking of the food list, which is a pure function rather than a LIKE
 * (D16).
 *
 * The FOLD it rests on is tested in tests/search/fold.test.ts, where the module
 * went in slice 10. What stays here is the part that is specific to foods: that
 * a brand ranks below a name, and that an exact name beats a prefix beats a
 * word beats a substring. The strength search ranks a muscle and a piece of
 * equipment instead, with its own cases — sharing the barème would have been
 * sharing a coincidence.
 */

describe('ranking', () => {
  const foods = [
    { name: 'Pain de mie', brand: 'Harrys' },
    { name: 'Pain complet', brand: null },
    { name: 'Painaubeurre', brand: null },
    { name: 'Crème fraîche', brand: 'Elle & Vire' },
    { name: 'Yaourt nature', brand: 'Danone' },
  ];

  it('puts an exact name first, then a prefix, then a word, then a substring', () => {
    // The order matters because the list is the critical path: a food that
    // starts with what was typed sitting third costs a scroll every time.
    expect(scoreFood({ name: 'Pain', brand: null }, 'pain')).toBeGreaterThan(
      scoreFood({ name: 'Pain de mie', brand: null }, 'pain'),
    );
    expect(scoreFood({ name: 'Pain de mie', brand: null }, 'pain')).toBeGreaterThan(
      scoreFood({ name: 'Pain de mie', brand: null }, 'mie'),
    );
    expect(scoreFood({ name: 'Pain de mie', brand: null }, 'mie')).toBeGreaterThan(
      scoreFood({ name: 'Painaubeurre', brand: null }, 'aubeurre'),
    );
  });

  it('ranks a brand match below every name match', () => {
    // "danone" should find the yoghurt, but a term matching a NAME is almost
    // always the one meant, so it wins whatever kind of match it is.
    const byBrand = scoreFood({ name: 'Yaourt nature', brand: 'Danone' }, 'dan');
    const byNameSubstring = scoreFood({ name: 'Danette', brand: null }, 'dan');

    expect(byBrand).toBeGreaterThan(0);
    expect(byNameSubstring).toBeGreaterThan(byBrand);
  });

  it('finds an accented name from an unaccented term', () => {
    // The reason the search is in memory at all: SQLite's NOCASE and lower()
    // are ASCII-only, and a folded column would be stored derived data (D9).
    expect(searchFoods(foods, 'creme').map((food) => food.name)).toEqual([
      'Crème fraîche',
    ]);
    expect(searchFoods(foods, 'fraiche').map((food) => food.name)).toEqual([
      'Crème fraîche',
    ]);
  });

  it('returns everything alphabetically for an empty term', () => {
    // The library's resting state, so the screen needs no separate browse path.
    expect(searchFoods(foods, '   ').map((food) => food.name)).toEqual([
      'Crème fraîche',
      'Pain complet',
      'Pain de mie',
      'Painaubeurre',
      'Yaourt nature',
    ]);
  });

  it('orders case-insensitively rather than by code point', () => {
    const mixed = [
      { name: 'Zucchini', brand: null },
      { name: 'abricot', brand: null },
      { name: 'Banane', brand: null },
    ];
    expect(searchFoods(mixed, '').map((food) => food.name)).toEqual([
      'abricot',
      'Banane',
      'Zucchini',
    ]);
  });

  it('drops what does not match at all', () => {
    expect(searchFoods(foods, 'zzz')).toEqual([]);
  });
});

/**
 * The probe, which is the one thing here that cannot be observed from Node.
 *
 * Node always carries the normalisation tables, so every other test in this
 * file exercises the branch that will NOT run on the phone if Hermes lacks
 * them. These cases replace String.prototype.normalize to walk the three ways
 * an engine can fail to have it, and the third is why the probe calls the
 * function instead of asking whether it exists: a normalize that THROWS would
 * pass a typeof check and then raise on every keystroke of the critical path.
 */
