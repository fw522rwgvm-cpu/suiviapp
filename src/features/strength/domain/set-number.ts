import type { SetType } from '@/core/db/schema';

/**
 * The number each set SHOWS, counting working sets only (specs 14.41).
 *
 * > Quand une série est de type échauffement, drop, long, elle ne compte pas
 * > comme une série pour les séries dites normales.
 *
 * So a block of [échauffement, travail, travail] reads Éch · 1 · 2, not
 * Éch · 2 · 3. A warm-up is something you do before the exercise starts; making
 * it consume the number 1 meant the first real set was called the second one,
 * on every exercise anybody warms up for.
 *
 * ## IT IS A DISPLAY RULE AND TOUCHES NOTHING STORED
 *
 * `session_set.set_index` is the ROUND and it keeps counting every set — it is
 * what the PRÉCÉDENT column matches on (specs 14.39), and renumbering it would
 * silently re-pair this week's sets against last week's different ones. The two
 * are deliberately separate: one is identity, this is a label.
 *
 * ## `null` FOR A SET THAT IS NOT WORK, RATHER THAN A NUMBER NOBODY SHOWS
 *
 * The three other kinds display their own short word — Éch, Drop, Long — so a
 * number for them would be a value computed to be thrown away, and the next
 * person to read it would reasonably assume it meant something.
 *
 * ## KEYED, SO A SUPERSET COUNTS EACH EXERCISE ON ITS OWN
 *
 * A superset alternates A, B, A, B: each exercise has its own first working
 * set, and the letters beside the numbers are what say which is which. Counting
 * across the block would number A's second set 3.
 */
export function workSetNumbers(
  sets: readonly { key: string; setType: SetType }[],
): (number | null)[] {
  const counted = new Map<string, number>();

  return sets.map((set) => {
    if (set.setType !== 'work') return null;
    const next = (counted.get(set.key) ?? 0) + 1;
    counted.set(set.key, next);
    return next;
  });
}
