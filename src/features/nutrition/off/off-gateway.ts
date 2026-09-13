import { getAppDatabase } from '@/core/db/app-database';
import { readSetting, SETTING_KEYS } from '@/features/settings/data/settings-reads';
import { writeSetting } from '@/features/settings/data/settings-writes';
import { createOffClient, type OffClient, type SuspensionStore } from './off-client';
import { readSuspension } from './rate-limit';

/**
 * Where the Open Food Facts client meets the real world.
 *
 * THE ONLY MODULE IN off/ THAT NAMES A REAL DEPENDENCY: the global fetch, the
 * system clock, and the application's database. Everything else in this folder
 * takes them as arguments, which is what lets the client, the parser, the rate
 * limiter and the cache all run in Node against fakes and a real SQLite file
 * (D15).
 *
 * It is the same split slice 0 made in core/db — pure on one side, native on
 * the other — and the same reason: the parts worth testing are the parts that
 * fail plausibly, and they must not need a phone.
 */

/**
 * The suspension, read from and written to `setting` on every use.
 *
 * READ EVERY TIME rather than cached in memory, and that is deliberate. It
 * costs one indexed lookup on a path that is about to do network I/O, so the
 * cost is nothing; and it means the value survives everything — a forced quit,
 * a second screen, and an import that replaces the entire database underneath
 * the running application (slice 2 does exactly that without restarting).
 *
 * A value that cannot be trusted reads as "no suspension": readSuspension
 * refuses anything corrupt, already past, or so far ahead that only a clock
 * change explains it.
 */
function settingSuspension(): SuspensionStore {
  return {
    read() {
      const raw = readSetting(getAppDatabase(), SETTING_KEYS.offSuspendedUntil);
      return readSuspension(raw, Date.now());
    },
    write(untilMs: number) {
      writeSetting(getAppDatabase(), SETTING_KEYS.offSuspendedUntil, String(untilMs));
    },
  };
}

/**
 * The one client the application uses.
 *
 * A single instance, because the per-minute sliding window lives inside it: two
 * clients would each believe they had the full budget, and together they would
 * spend twice it. That is the failure the rate limiter exists to prevent, so it
 * would be an unusually silly way to hit it.
 */
let client: OffClient | null = null;

export function getOffClient(): OffClient {
  client ??= createOffClient({
    fetchImpl: globalThis.fetch.bind(globalThis),
    now: Date.now,
    suspension: settingSuspension(),
  });
  return client;
}
