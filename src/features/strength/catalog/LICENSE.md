# Exercise catalogue — attribution and licence

The exercise names, muscles and equipment in `catalog.generated.ts`, and every
image in `assets/exercises/`, come from:

**wger** — <https://wger.de> — the wger Workout Manager exercise database.

The database is community-contributed and each record carries its own licence.
Those in use here:

- CC-BY-SA 3
- CC-BY-SA 4

Fetched by `scripts/fetch-exercise-catalog.mjs`. Nothing is modified: the images
are wger's own 400 px renderings, byte for byte, and the names are the French
translations as wger's contributors wrote them. What this project adds is a
mapping onto its own fifteen muscles and eight equipment values, which is its
own work and not an adaptation of wger's.

---

## Image credits

CC BY and CC BY-SA require the author to be named where one is recorded. wger
records it per image; where it is blank, the work is credited to the wger
project itself.

- (non nommé) — 55 images
- Everkinetic — 30 images
- Franpol — 21 images
- AlucardEvil40 — 11 images
- philip — 9 images
- nishant0712 — 5 images
- cshep442 — 5 images
- Settebello — 4 images
- anonymous — 4 images
- Tierrasverdes — 4 images
- Lynn_McIntyre — 3 images
- Rottekongen — 3 images
- clafal — 3 images
- Davidgj32 — 2 images
- JackSparrow — 2 images
- hans — 2 images
- utkb — 2 images
- roneydya — 2 images
- carlos3c — 2 images
- erikocobra — 2 images
- 54str — 2 images
- Imobard — 2 images
- barry — 2 images
- cleen — 1 image
- captive0592 — 1 image
- cynomops — 1 image
- Mariano_O — 1 image
- shushu — 1 image
- Nick E — 1 image
- benjamin.yildiz@proton.me — 1 image
- RiccaBaro — 1 image
- wakanda90 — 1 image
- anon1337 — 1 image
- brucem — 1 image
- Gavru — 1 image
- technofer — 1 image
- lion — 1 image
- Workout Guru — 1 image
- anto.kreegyr — 1 image
- Athlean-X — 1 image

A large share of these are credited to **Everkinetic**, whose drawings wger
imported and translated — the same source this slice used before switching, and
the reason switching cost nothing in coverage.

---

## Why a licensed asset is in this repository, where real data never is

D15 and the `.gitignore` forbid real exports and anything derived from real
measurements reaching a public repository. That rule is about **the user's
data**, and it is not this.

The precedent is already here: `assets/fonts/` holds four Nunito files with
`OFL.txt` beside them. A licensed third-party asset, carried with its notice, is
a different thing from a real workout or a real weight.

## And why the licence matters even though one person uses the application

Because the REPOSITORY is public (D15) and the IPAs are published as GitHub
releases. Copyright restricts copying and distribution, not private use — and
both of those are distribution, whoever runs the app afterwards. "Only I use it"
would hold for a private repository with private releases; it does not hold
here, and CC BY-SA costs nothing worth taking a risk to avoid.

## What was refused, and why

| Source | Media | Actual licence | Verdict |
| --- | --- | --- | --- |
| Gym Visual, redistributed by several "MIT" datasets | animated GIF | The repository is MIT; the media is © Gym Visual and its terms require buying a licence to use it | refused |
| `yuhonas/free-exercise-db` | photographs | Declares itself Unlicense. The images are Bodybuilding.com's studio photographs of an identifiable person; the declaration was not the declarant's to make | refused |
| `everkinetic/data` | two-pose SVG | CC BY-SA 4.0, genuinely granted | used first, then superseded — wger contains it, in French |
| **wger** | line-art PNG | **CC BY-SA 3 and 4, credited per image** | **in use** |
