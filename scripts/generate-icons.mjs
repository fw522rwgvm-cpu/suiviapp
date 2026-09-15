import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Draws the two application icons (specs 2.2).
 *
 * ## WHY A SCRIPT AND NOT TWO IMAGE FILES
 *
 * The same reason the migrations bundle is generated: a binary asset nobody can
 * regenerate is a decision nobody can revisit. Here it is also the only way —
 * this machine has no ImageMagick, no rsvg, no Python imaging, and section 5
 * admits no dependency for drawing a square.
 *
 * So the PNG is written by hand. Node's zlib is enough: a PNG is a signature,
 * an IHDR chunk, one deflated IDAT and an IEND, each with a CRC. The drawing
 * itself is signed distance fields sampled once per pixel, which gives clean
 * edges without supersampling sixteen million points.
 *
 * ## TWO ICONS, BECAUSE THERE WERE NOT
 *
 * app.config.ts named one icon for both variants, so the daily application and
 * the development one were indistinguishable on the home screen — on a phone
 * that carries both, side by side, where one holds real data and the other is
 * a throwaway. Specs 2.2 makes that distinction matter more than looks do.
 *
 * ## THE SHAPE IS THE APPLICATION'S OWN
 *
 * A three-quarter gauge, open at the bottom: 270 degrees from 225, which is
 * exactly what progress-ring.tsx draws on every meal and on the day. Rounded
 * ends are circles whose diameter is the stroke width, centred on the arc's
 * centre line — geometrically a round cap rather than something shaped like
 * one, which is the note that component already carries.
 *
 * ## THE GROUND IS DARK, AND THAT IS MEASURED RATHER THAN CHOSEN
 *
 * The brand mint is #08c99c in both themes, and the project has the figures:
 * 2.13:1 against white, 9.60:1 against the dark ground. An icon is read at
 * sixty points across a wallpaper nobody controls, so it takes the ground where
 * the mint is legible.
 *
 * Run with: npm run icons:generate
 */

const SIZE = 1024;

/** The brand mint, identical in both themes (core/theme/tokens.ts). */
const MINT = '#08c99c';
/** The dark theme's page ground, where the mint reaches 9.60:1. */
const DARK = '#0f0f11';
/** The dark theme's border, for the unfilled part of the gauge. */
const TRACK = '#2c2c31';
/** The dark theme's warning amber — the one colour that already means "look". */
const AMBER = '#e0a942';

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/**
 * An 8-bit RGB PNG, no alpha.
 *
 * NO ALPHA CHANNEL ON PURPOSE. iOS rejects a transparent app icon, and a
 * rounded corner drawn here would be drawn again by the system over it. The
 * square is filled edge to edge and the platform does the rest.
 */
function encodePng(rgb, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2: truecolour, no alpha
  // 10, 11, 12 stay zero: deflate, adaptive filtering, no interlace.

  // Each scanline is prefixed with its filter type. Zero — "none" — because
  // these images are large flat areas, which deflate handles well on its own,
  // and a filter would only make the encoder harder to read.
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y += 1) {
    const from = y * size * 3;
    raw[y * (size * 3 + 1)] = 0;
    rgb.copy(raw, y * (size * 3 + 1) + 1, from, from + size * 3);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function rgbOf(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * Coverage from a signed distance, in pixels.
 *
 * One sample per pixel rather than a supersampled grid: a distance field knows
 * how far the edge is, so the fraction of the pixel it covers follows from it.
 * Sixteen million samples per shape would have been the alternative.
 */
function coverage(distance) {
  return Math.min(1, Math.max(0, 0.5 - distance));
}

/** Distance from a point to a segment — the basis of every rounded stroke. */
function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

class Canvas {
  constructor(size, background) {
    this.size = size;
    this.data = Buffer.alloc(size * size * 3);
    const [r, g, b] = rgbOf(background);
    for (let i = 0; i < size * size; i += 1) {
      this.data[i * 3] = r;
      this.data[i * 3 + 1] = g;
      this.data[i * 3 + 2] = b;
    }
  }

  /** Blends `hex` over every pixel, weighted by what `sdf` says it covers. */
  paint(hex, sdf) {
    const [r, g, b] = rgbOf(hex);
    for (let y = 0; y < this.size; y += 1) {
      for (let x = 0; x < this.size; x += 1) {
        const alpha = coverage(sdf(x + 0.5, y + 0.5));
        if (alpha <= 0) continue;
        const i = (y * this.size + x) * 3;
        this.data[i] += (r - this.data[i]) * alpha;
        this.data[i + 1] += (g - this.data[i + 1]) * alpha;
        this.data[i + 2] += (b - this.data[i + 2]) * alpha;
      }
    }
  }
}

/**
 * An arc of a ring, with round caps — progress-ring.tsx in one function.
 *
 * Angles run CLOCKWISE FROM TWELVE O'CLOCK, as they do in that component, so
 * the two agree about what "225 degrees" means. The caps are circles of the
 * stroke's own width placed on the centre line, which is the same shape a round
 * cap is rather than an approximation of it.
 */
function arc(cx, cy, radius, width, startDeg, sweepDeg) {
  const half = width / 2;
  const toPoint = (deg) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
  };

  return (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    // Clockwise from twelve, 0..360.
    let angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    if (angle < 0) angle += 360;
    let delta = angle - startDeg;
    if (delta < 0) delta += 360;

    const onBand = Math.abs(Math.hypot(dx, dy) - radius) - half;
    // Inside the swept angle: the band itself. Outside it: only the two caps,
    // so the arc ends in a circle rather than a cut.
    if (delta <= sweepDeg) return onBand;

    const [sx, sy] = toPoint(startDeg);
    const [ex, ey] = toPoint(startDeg + sweepDeg);
    return (
      Math.min(
        distanceToSegment(x, y, sx, sy, sx, sy),
        distanceToSegment(x, y, ex, ey, ex, ey),
      ) - half
    );
  };
}

/** A thick line with round ends, for the letters and the sash. */
function stroke(ax, ay, bx, by, width) {
  return (x, y) => distanceToSegment(x, y, ax, ay, bx, by) - width / 2;
}

/** The union of several shapes — a letter is a handful of strokes. */
function union(...shapes) {
  return (x, y) => Math.min(...shapes.map((shape) => shape(x, y)));
}

/**
 * D, E and V, drawn as strokes rather than typeset.
 *
 * No font is embedded and none is needed: three letters in a geometric hand are
 * a dozen segments, and a bundled typeface would have to be licensed, read and
 * rasterised for a word that never changes.
 *
 * Each letter is drawn inside a box of `w` by `h` whose top-left is (x, y).
 */
function letterD(x, y, w, h, t) {
  const r = h / 2;
  const spine = x + t / 2;
  return union(
    stroke(spine, y, spine, y + h, t),
    // The bowl: a half ring, open to the left, joining the spine at both ends.
    arc(x + w - r, y + r, r - t / 2, t, 0, 180),
    stroke(spine, y + t / 2, x + w - r, y + t / 2, t),
    stroke(spine, y + h - t / 2, x + w - r, y + h - t / 2, t),
  );
}

function letterE(x, y, w, h, t) {
  const spine = x + t / 2;
  return union(
    stroke(spine, y, spine, y + h, t),
    stroke(spine, y + t / 2, x + w, y + t / 2, t),
    stroke(spine, y + h / 2, x + w * 0.88, y + h / 2, t),
    stroke(spine, y + h - t / 2, x + w, y + h - t / 2, t),
  );
}

function letterV(x, y, w, h, t) {
  return union(
    stroke(x + t / 2, y, x + w / 2, y + h, t),
    stroke(x + w - t / 2, y, x + w / 2, y + h, t),
  );
}

// ---------------------------------------------------------------------------
// The two icons
// ---------------------------------------------------------------------------

/**
 * The gauge both icons carry.
 *
 * Three quarters of a turn from 225 degrees — a 90 degree gap centred on six
 * o'clock — filled to about two thirds. Filled rather than complete because the
 * subject is a day in progress: a closed ring would say "done", which is not
 * what an application you open every morning is about.
 */
const GAUGE_SWEEP = 270;
const GAUGE_START = 225;
const GAUGE_FILL = 0.66;

function drawGauge(canvas, { cx, cy, radius, width, fill = GAUGE_FILL }) {
  canvas.paint(TRACK, arc(cx, cy, radius, width, GAUGE_START, GAUGE_SWEEP));
  canvas.paint(MINT, arc(cx, cy, radius, width, GAUGE_START, GAUGE_SWEEP * fill));
}

function dailyIcon() {
  const canvas = new Canvas(SIZE, DARK);
  const centre = SIZE / 2;

  drawGauge(canvas, {
    cx: centre,
    cy: centre,
    // Generous margins: iOS crops the square to a rounded rectangle and the
    // home screen shrinks it to sixty points, so a shape reaching the edge
    // loses its corners and its legibility at once.
    radius: SIZE * 0.3,
    width: SIZE * 0.1,
  });

  return canvas;
}

/**
 * The development icon.
 *
 * ## IT HAS TO BE TOLD APART AT SIXTY POINTS, NOT ADMIRED AT A THOUSAND
 *
 * Both variants sit on the same home screen, one holding real data and the
 * other a throwaway database (specs 2.2). Launching the wrong one is cheap;
 * EXPORTING from the wrong one, or trusting a figure read on the wrong one, is
 * not. So the difference is not a tint — it is three differences at once, any
 * one of which carries at thumbnail size:
 *
 *  - an amber ground instead of a near-black one, which is the whole square;
 *  - the gauge shrunk and pushed up, making room for;
 *  - the word DEV across the bottom, in the dark ground colour.
 *
 * Amber rather than red: red is the destructive colour of this application
 * (#e02d1f, pinned by a contrast test), and an icon that shouted "danger" every
 * time the development build was opened would teach the eye to ignore it.
 * `warning` already means "look at this" and means nothing else.
 */
/**
 * Where DEV sits, as one object.
 *
 * Shared by the drawing and by the check below, so the assertions cannot drift
 * from the shapes they are asserting about — the whole point of checking
 * something nobody here can look at.
 */
function devMetrics() {
  /**
   * THE STROKE IS A FIFTH OF THE HEIGHT, AND THAT IS ARITHMETIC RATHER THAN TASTE.
   *
   * The first attempt used a stroke of 0.055 against a height of 0.17 — three
   * bars of fifty-six pixels inside a hundred and seventy-four, which leaves
   * THREE PIXELS between them. The E would have read as a filled rectangle at
   * icon size, and nothing in the drawing would have said so; the probe below
   * is what caught it.
   *
   * A letter of three bars needs five bands: bar, air, bar, air, bar. So the
   * stroke is a fifth of the height and the air is what remains — here 43
   * against 41, near enough to even that the E reads as an E.
   */
  const h = SIZE * 0.2;
  const t = h * 0.21;
  const w = SIZE * 0.15;
  const gap = SIZE * 0.032;
  const left = SIZE / 2 - (w * 3 + gap * 2) / 2;
  return { t, h, w, gap, left, top: SIZE * 0.645 };
}

function devIcon() {
  const canvas = new Canvas(SIZE, AMBER);

  drawGauge(canvas, {
    cx: SIZE / 2,
    cy: SIZE * 0.36,
    radius: SIZE * 0.21,
    width: SIZE * 0.075,
  });

  // DEV, sitting on the lower third, in the dark ground so it reads as cut out
  // of the amber rather than laid on top of it.
  const { t, h, w, gap, left, top } = devMetrics();

  canvas.paint(
    DARK,
    union(
      letterD(left, top, w, h, t),
      letterE(left + w + gap, top, w, h, t),
      letterV(left + (w + gap) * 2, top, w, h, t),
    ),
  );

  return canvas;
}

// ---------------------------------------------------------------------------
// Verification, because nobody here can look at the result
// ---------------------------------------------------------------------------

/**
 * A coarse luminance print of the image.
 *
 * This script runs where there is no way to open a PNG, so "it wrote a file" is
 * not evidence that it drew anything. Printing the shape is what turns the
 * claim into something checkable — the same reason the readable-bundle export
 * exists for worklets.
 */
function preview(canvas, columns = Number(process.argv[2]) || 44) {
  const ramp = ' .:-=+*#%@';
  const step = canvas.size / columns;
  const rows = [];

  for (let row = 0; row < columns / 2; row += 1) {
    let line = '';
    for (let column = 0; column < columns; column += 1) {
      const x = Math.floor(column * step + step / 2);
      const y = Math.floor(row * step * 2 + step);
      const i = (y * canvas.size + x) * 3;
      const luma =
        (0.2126 * canvas.data[i] + 0.7152 * canvas.data[i + 1] + 0.0722 * canvas.data[i + 2]) /
        255;
      line += ramp[Math.min(ramp.length - 1, Math.round(luma * (ramp.length - 1)))];
    }
    rows.push(line);
  }

  return rows.join('\n');
}

/**
 * Reads one pixel back, and says which of the named colours it is nearest.
 *
 * Anti-aliased edges are avoided by sampling well inside a shape, so a probe
 * that lands between two colours means the shape is not where it was meant to
 * be — which is the only thing this can usefully detect.
 */
function colourAt(canvas, x, y, palette) {
  const i = (Math.round(y) * canvas.size + Math.round(x)) * 3;
  const pixel = [canvas.data[i], canvas.data[i + 1], canvas.data[i + 2]];

  let best = null;
  let bestDistance = Infinity;
  for (const [name, hex] of Object.entries(palette)) {
    const [r, g, b] = rgbOf(hex);
    const distance = Math.hypot(pixel[0] - r, pixel[1] - g, pixel[2] - b);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = name;
    }
  }
  return best;
}

/**
 * What must be true of each icon, checked rather than assumed.
 *
 * This script runs where no PNG can be opened, so "it wrote a file" is not
 * evidence that it drew a gauge or that DEV says DEV. Each probe below is a
 * point whose colour follows from the geometry: the spine of a D is dark, the
 * bowl it encloses is not. A shape drawn in the wrong place fails here instead
 * of being discovered on a home screen after a fifteen-minute CI cycle.
 */
function check(name, canvas, probes, palette) {
  const failures = probes.filter(
    ([label, x, y, expected]) => colourAt(canvas, x, y, palette) !== expected,
  );

  for (const [label, x, y, expected] of probes) {
    const found = colourAt(canvas, x, y, palette);
    const mark = found === expected ? 'ok  ' : 'FAIL';
    console.log(`  ${mark} ${label.padEnd(34)} expected ${expected}, found ${found}`);
  }

  if (failures.length > 0) {
    throw new Error(`${name}: ${failures.length} probe(s) failed`);
  }
}

const out = join(process.cwd(), 'assets');

const daily = dailyIcon();
const dev = devIcon();
const centre = SIZE / 2;
const { t, h, w, gap, left, top } = devMetrics();
const dPalette = { MINT, DARK, TRACK, AMBER };

console.log('\n=== icon.png ===');
console.log(preview(daily));
console.log('  probes:');
check(
  'icon.png',
  daily,
  [
    // The gauge runs clockwise from 225 degrees, so the filled part climbs the
    // LEFT side and over the top; the track is what is left, on the right.
    ['ground at the centre', centre, centre, 'DARK'],
    ['filled arc, left of centre', centre - SIZE * 0.3, centre, 'MINT'],
    ['track, right of centre', centre + SIZE * 0.3, centre, 'TRACK'],
    ['gap at six o\u2019clock', centre, centre + SIZE * 0.3, 'DARK'],
    ['corner stays ground', SIZE * 0.06, SIZE * 0.06, 'DARK'],
  ],
  dPalette,
);

console.log('\n=== icon-dev.png ===');
console.log(preview(dev));
console.log('  probes:');
check(
  'icon-dev.png',
  dev,
  [
    ['amber ground in a corner', SIZE * 0.06, SIZE * 0.06, 'AMBER'],
    ['gauge is still mint', centre - SIZE * 0.21, SIZE * 0.36, 'MINT'],
    // D: a spine on the left, and amber inside the bowl it encloses.
    ['D spine', left + t / 2, top + h / 2, 'DARK'],
    ['D bowl is hollow', left + w - h / 2, top + h / 2, 'AMBER'],
    ['D top bar', left + w * 0.45, top + t / 2, 'DARK'],
    ['D bottom bar', left + w * 0.45, top + h - t / 2, 'DARK'],
    // E: three bars and a spine, with air between the bars.
    ['E spine', left + w + gap + t / 2, top + h / 2, 'DARK'],
    ['E middle bar', left + w + gap + w * 0.5, top + h / 2, 'DARK'],
    // The two gaps of the E, which is what makes it an E rather than a block.
    // Sampled at the midpoint of each band, where an edge cannot reach.
    ['E air above middle bar', left + w + gap + w * 0.7, top + h * 0.25, 'AMBER'],
    ['E air below middle bar', left + w + gap + w * 0.7, top + h * 0.75, 'AMBER'],
    ['E bottom bar', left + w + gap + w * 0.8, top + h - t / 2, 'DARK'],
    // V: two diagonals meeting at the foot, open at the top.
    ['V left arm', left + (w + gap) * 2 + t / 2, top + t, 'DARK'],
    ['V foot', left + (w + gap) * 2 + w / 2, top + h - t / 2, 'DARK'],
    ['V opening', left + (w + gap) * 2 + w / 2, top + t, 'AMBER'],
  ],
  dPalette,
);

writeFileSync(join(out, 'icon.png'), encodePng(daily.data, SIZE));
writeFileSync(join(out, 'icon-dev.png'), encodePng(dev.data, SIZE));

console.log('\nWrote assets/icon.png and assets/icon-dev.png');
