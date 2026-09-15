import { describe, expect, it } from 'vitest';
import { toLocalDate } from '../../src/core/date';
import {
  HORIZON_DAYS,
  occurrencesFor,
} from '../../src/features/notifications/domain/occurrences';

/**
 * The arithmetic the whole slice rests on (D14, D3).
 *
 * iOS fires nothing in Node, so this is where the verifiable half of the slice
 * is: which instants, on which dates, about which day. Run under UTC,
 * America/New_York and Pacific/Kiritimati like every date test since slice 0 —
 * the only way a class of bug invisible from Paris in winter shows up.
 */

const MORNING = { hour: 7, minute: 30 };

/** Midnight cutoff: the ordinary case, and the default (specs 8.2). */
const MIDNIGHT = 0;

describe('occurrencesFor', () => {
  it('produces one occurrence per day of the horizon', () => {
    // 6am, so the 7:30 occurrence of the current day has not passed yet.
    const now = new Date(2026, 8, 15, 6, 0, 0);
    const found = occurrencesFor('weigh_in', MORNING, MIDNIGHT, now);

    expect(found).toHaveLength(HORIZON_DAYS);
    expect(found[0]?.fireDate).toBe(toLocalDate('2026-09-15'));
    expect(found[HORIZON_DAYS - 1]?.fireDate).toBe(toLocalDate('2026-09-21'));
  });

  it('drops the occurrence of today once its hour has gone by', () => {
    // 9am against a 7:30 reminder. iOS refuses a trigger in the past — the
    // package wraps the construction in a catch precisely because
    // UNTimeIntervalNotificationTrigger throws on a non-positive interval — and
    // a reminder for this morning, delivered at noon, is not something anyone
    // wants.
    const now = new Date(2026, 8, 15, 9, 0, 0);
    const found = occurrencesFor('weigh_in', MORNING, MIDNIGHT, now);

    expect(found).toHaveLength(HORIZON_DAYS - 1);
    expect(found[0]?.fireDate).toBe(toLocalDate('2026-09-16'));
  });

  it('gives every occurrence a distinct, stable identifier', () => {
    const now = new Date(2026, 8, 15, 6, 0, 0);
    const found = occurrencesFor('weigh_in', MORNING, MIDNIGHT, now);
    const ids = found.map((occurrence) => occurrence.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe('weigh_in:2026-09-15');

    // Stable across two builds from the same clock: this is what makes applying
    // a plan a diff rather than a teardown and rebuild.
    const again = occurrencesFor('weigh_in', MORNING, MIDNIGHT, now);
    expect(again.map((occurrence) => occurrence.id)).toEqual(ids);
  });

  it('carries 1-12 months, never JavaScript 0-11', () => {
    // The parts go straight into a CALENDAR trigger. An off-by-one here would
    // move every notification by a month, and nothing in Node would say so.
    const now = new Date(2026, 8, 15, 6, 0, 0);
    const [first] = occurrencesFor('weigh_in', MORNING, MIDNIGHT, now);

    expect(first).toMatchObject({ year: 2026, month: 9, day: 15, hour: 7, minute: 30 });
  });

  it('lands on the wall-clock hour asked for, in the local timezone', () => {
    const now = new Date(2026, 8, 15, 6, 0, 0);
    const [first] = occurrencesFor('weigh_in', MORNING, MIDNIGHT, now);
    const instant = new Date(first!.at);

    // Read back through local calendar fields, never by formatting: that is the
    // rule core/date is built on, and it is what makes this assertion mean the
    // same thing at +14 and at -11.
    expect(instant.getHours()).toBe(7);
    expect(instant.getMinutes()).toBe(30);
    expect(instant.getDate()).toBe(15);
  });

  it('crosses a month end without inventing a day', () => {
    const now = new Date(2026, 8, 28, 6, 0, 0);
    const found = occurrencesFor('weigh_in', MORNING, MIDNIGHT, now);

    expect(found.map((occurrence) => occurrence.fireDate)).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
  });

  it('crosses a year end', () => {
    const now = new Date(2026, 11, 30, 6, 0, 0);
    const found = occurrencesFor('weigh_in', MORNING, MIDNIGHT, now);

    expect(found[0]?.fireDate).toBe(toLocalDate('2026-12-30'));
    expect(found[2]?.fireDate).toBe(toLocalDate('2027-01-01'));
  });
});

describe('the subject date, and the cutoff (specs 14.15, resolved)', () => {
  it('is the firing date whenever the reminder is at or after the cutoff', () => {
    // The ordinary case, and it is safe by construction: specs 8.2 caps the
    // cutoff at 6, so every hour from 6 onwards has subjectDate === fireDate
    // whatever the cutoff is set to. Asserted at the worst allowed cutoff.
    const now = new Date(2026, 8, 15, 0, 30, 0);
    const found = occurrencesFor('weigh_in', { hour: 6, minute: 0 }, 6, now);

    for (const occurrence of found) {
      expect(occurrence.subjectDate).toBe(occurrence.fireDate);
    }
  });

  it('is YESTERDAY for a reminder set before the cutoff', () => {
    // The case the reserve of specs 14.15 left open. A 5:30 reminder with a 6h
    // cutoff is about the previous civil date — which is exactly what the
    // cutoff means, and what 14.15 already says about weighing at 3am: at 5:30
    // the whole application still calls it yesterday.
    //
    // This is not a special case anywhere: the subject date is
    // currentLocalDate applied to the firing instant, the same function every
    // screen uses. The condition reads the same date, so the reminder and the
    // check cannot disagree.
    const now = new Date(2026, 8, 15, 0, 30, 0);
    const found = occurrencesFor('weigh_in', { hour: 5, minute: 30 }, 6, now);

    expect(found[0]?.fireDate).toBe(toLocalDate('2026-09-15'));
    expect(found[0]?.subjectDate).toBe(toLocalDate('2026-09-14'));
  });

  it('keeps one subject date per firing date, so identifiers stay unique', () => {
    // Two occurrences of one kind can share a subject — a 5:30 reminder on the
    // 15th and one on the 16th are about the 14th and the 15th — but never a
    // firing day, which is why the identifier is keyed on fireDate.
    const now = new Date(2026, 8, 15, 0, 30, 0);
    const found = occurrencesFor('weigh_in', { hour: 5, minute: 30 }, 6, now);
    const ids = found.map((occurrence) => occurrence.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
