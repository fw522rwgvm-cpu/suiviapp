# Exercise drawings — attribution and licence

`drawings.generated.ts` contains path data adapted from:

**everkinetic/data** — <https://github.com/everkinetic/data>
Copyright © Greg Priday and the everkinetic contributors.
Licensed under **Creative Commons Attribution-ShareAlike 4.0 International**
(CC BY-SA 4.0) — <https://creativecommons.org/licenses/by-sa/4.0/>

Extracted by `scripts/extract-exercise-media.mjs`. The generated module is an
**adaptation** of the licensed material — the paths are copied verbatim, but
they are re-grouped, re-keyed and re-coloured at render time — and is therefore
distributed under the same licence.

---

## What this licence asks, and what is done about it

- **Attribution.** The author, the source, the licence and a link, in this file
  and in the header of the generated module.
- **Licence notice travelling with the work.** This file sits beside the module
  it covers, in the same folder, so it cannot be separated from it by moving a
  directory.
- **ShareAlike.** The adaptation is under CC BY-SA 4.0. Section 2(a)(1) of the
  licence is explicit that including licensed material in a *collection* does
  not subject the rest of that collection to it, so the application's own source
  is unaffected.
- **Indication of changes.** The paths are unmodified; what changed is the
  container — one TypeScript module keyed by this project's own catalogue keys,
  with the two fill groups mapped to theme colours instead of `#fff` and `#333`.

---

## Why a licensed asset is in this repository, where real data never is

D15 and the `.gitignore` forbid real exports and anything derived from real
measurements reaching a public repository. That rule is about **the user's
data**, and it is not this.

The precedent is already here: `assets/fonts/` holds four Nunito files with
`OFL.txt` beside them. A licensed third-party asset, carried with its notice, is
a different thing from a real workout or a real weight — and this one is more
robust than a font, because it is text that can be read, diffed and regenerated
by a script anybody can run.

---

## Why this source, and what was refused

Nothing animated exists under a permissive licence. Checked before anything was
copied, because the body map cost three iterations of exactly this:

| Source | Media | Actual licence | Verdict |
| --- | --- | --- | --- |
| Gym Visual, redistributed by several "MIT" datasets | animated GIF | The repository is MIT; the media is © Gym Visual, redistributed with a permission granted to that repository, and its own terms require a separate licence to reuse | refused |
| `yuhonas/free-exercise-db` | photographs | Declares itself Unlicense. The images are Bodybuilding.com's studio photographs of an identifiable person; the declaration was not the declarant's to make | refused |
| `exercemus/exercises` | — | MIT on the list, curated from wger.de (CC BY-SA); the media is not the repository's to license | names only |
| **`everkinetic/data`** | two-pose SVG line art | **CC BY-SA 4.0, granted by the author** | **used, copyleft accepted explicitly** |

CC BY-SA is copyleft, which this project refused once before — Wikimedia was
turned down for the body map on that ground. It is used here by explicit
decision, recorded in `specs §14.30` and `architecture §9.24`, because the
alternative was shipping no media at all.
