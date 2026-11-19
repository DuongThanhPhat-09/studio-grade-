/**
 * All words and product data. Kept short on purpose: the object does the talking.
 * Each headline array entry is one typeset line.
 */

export const brand = {
  name: 'Orme',
  product: 'No. 1',
  price: '€340',
  ships: 'Ships from February',
}

/* ------------------------------------------------------------------ */
/* Beats (scroll positions) and chapters (what the reader sees)        */
/* ------------------------------------------------------------------ */

export type BeatId =
  | 'intro'
  | 'mAlu'
  | 'mKnurl'
  | 'mCrank'
  | 'mWalnut'
  | 'mBurr'
  | 'form'
  | 'engineering'
  | 'xray'
  | 'grind'
  | 'build'
  | 'lab'
  | 'final'

export interface Beat {
  id: BeatId
  chapter: number
  /** Scroll length, viewport heights. */
  track: number
  /** Copy is on screen while scroll ∈ [k − before, k + after]. */
  text: [before: number, after: number]
}

export const beats: Beat[] = [
  { id: 'intro', chapter: 0, track: 120, text: [0.16, 0.5] },
  { id: 'mAlu', chapter: 0, track: 95, text: [0.12, 0.5] },
  { id: 'mKnurl', chapter: 0, track: 95, text: [0.12, 0.5] },
  { id: 'mCrank', chapter: 0, track: 95, text: [0.12, 0.5] },
  { id: 'mWalnut', chapter: 0, track: 95, text: [0.12, 0.5] },
  { id: 'mBurr', chapter: 0, track: 110, text: [0.12, 0.52] },
  { id: 'form', chapter: 0, track: 130, text: [0.14, 0.56] },
  { id: 'engineering', chapter: 1, track: 150, text: [0.12, 0.62] },
  { id: 'xray', chapter: 2, track: 210, text: [0.1, 0.76] },
  { id: 'grind', chapter: 3, track: 150, text: [0.1, 0.72] },
  { id: 'build', chapter: 4, track: 150, text: [0.1, 0.72] },
  { id: 'lab', chapter: 5, track: 150, text: [0.1, 0.72] },
  { id: 'final', chapter: 6, track: 100, text: [0.04, Infinity] },
]

export const beatIndex = Object.fromEntries(beats.map((b, i) => [b.id, i])) as Record<BeatId, number>

export const chapters = [
  { index: '01', label: 'Film', beat: 'intro' },
  { index: '02', label: 'Engineering', beat: 'engineering' },
  { index: '03', label: 'X-ray', beat: 'xray' },
  { index: '04', label: 'Grind', beat: 'grind' },
  { index: '05', label: 'Build', beat: 'build' },
  { index: '06', label: 'Coffee Lab', beat: 'lab' },
  { index: '07', label: 'Finale', beat: 'final' },
] as const

/* ------------------------------------------------------------------ */
/* Film copy                                                           */
/* ------------------------------------------------------------------ */

export const film = {
  intro: { eyebrow: 'Hand grinder', headline: ['Made to be', 'turned.'], body: 'A hand grinder for people who make one cup at a time.' },
  macros: {
    mAlu: { n: 'i', title: 'Bead-blasted 6061', line: 'A soft satin that keeps no fingerprints.' },
    mKnurl: { n: 'ii', title: 'Knurled at 1.2 mm', line: 'Rolled into the anodised sleeve. Enough to hold, never enough to catch.' },
    mCrank: { n: 'iii', title: 'Brushed stainless', line: 'The grain runs the length of the arm — the way you push it.' },
    mWalnut: { n: 'iv', title: 'Oiled walnut', line: 'Turned, oiled, and left to darken in your hand.' },
    mBurr: { n: 'v', title: 'Titanium nitride', line: 'A coat harder than the steel beneath it.' },
  } as Record<string, { n: string; title: string; line: string }>,
  form: { headline: ['Nothing added', 'for show.'], body: 'One axis, no visible fasteners. Each line on the body marks a part that needs to be there.' },
  engineering: {
    headline: ['Forty-eight', 'millimetres of steel.'],
    body: 'A hardened conical burr rides between two sealed bearings, held true to two hundredths of a millimetre.',
    cta: 'Explore the engineering',
  },
  xray: {
    headline: ['One turn in,', 'one turn out.'],
    body: 'The crank drives a hex shaft; the shaft drives the burr. No gears, no slack — every degree you turn is a degree of cut.',
    hint: 'Drag the crank — or scroll.',
  },
  grind: { headline: ['Set the grind.'], body: 'Choose a method. The dial finds its setting and the burr moves to match.' },
  build: { headline: ['Build', 'your Orme.'], cta: 'See yours' },
  lab: { headline: ['Coffee Lab'], body: 'Pick a method and a dose. We’ll set the rest.' },
  final: { headline: ['Orme', 'No. 1'], line: 'Engineered for the ritual.', cta: 'Build yours' },
}

/** Drivetrain callouts for the X-ray chapter. */
export const drive = [
  { part: 'crank', index: '01', name: 'Crank', detail: 'You turn' },
  { part: 'shaft', index: '02', name: 'Hex shaft', detail: 'Carries it 1 : 1' },
  { part: 'burr', index: '03', name: 'Burr', detail: 'Cuts against a fixed ring' },
] as const

/* ------------------------------------------------------------------ */
/* Parts (Engineering / Inspect)                                       */
/* ------------------------------------------------------------------ */

export type PartId = 'crank' | 'knob' | 'shaft' | 'bearing' | 'body' | 'dial' | 'burr' | 'cup'

export interface PartInfo {
  id: PartId
  name: string
  text: string
  specs: [string, string][]
}

export const parts: PartInfo[] = [
  {
    id: 'knob',
    name: 'Walnut knob',
    text: 'Turned from American walnut and oiled. It spins on its own spindle, so your hand never twists.',
    specs: [['Height', '26 mm'], ['Spindle', 'Stainless'], ['Finish', 'Hand-rubbed oil']],
  },
  {
    id: 'crank',
    name: 'Crank',
    text: 'Brushed stainless with a 66 mm throw — long enough for leverage, short enough to travel.',
    specs: [['Throw', '66 mm'], ['Material', '316 stainless'], ['Fixing', 'Hex, acorn nut']],
  },
  {
    id: 'dial',
    name: 'Adjustment dial',
    text: 'Thirty detents per turn, each moving the burr 20 µm. Set it once and it stays.',
    specs: [['Steps', '30 per turn'], ['Resolution', '20 µm'], ['Range', '0 – 1.2 mm']],
  },
  {
    id: 'body',
    name: 'Body',
    text: 'One billet of 6061, bored and turned. The knurled sleeve is a separate part, hard anodised to outlast your grip.',
    specs: [['Material', '6061-T6'], ['Wall', '1.3 mm'], ['Grip', '1.2 mm knurl']],
  },
  {
    id: 'shaft',
    name: 'Drive shaft',
    text: 'Hexagonal, 6 mm across flats. It carries every turn of the crank straight to the burr.',
    specs: [['Section', '6 mm hex'], ['Drive', '1 : 1'], ['Material', 'Hardened 420']],
  },
  {
    id: 'bearing',
    name: 'Sealed bearings',
    text: 'Two of them, top and bottom, so the burr cannot wobble under load.',
    specs: [['Type', '2 × deep groove'], ['Runout', '≤ 0.02 mm'], ['Service', 'Sealed for life']],
  },
  {
    id: 'burr',
    name: 'Conical burr',
    text: 'Hardened 7Cr17MoV, nitride-coated. Six blades crack the bean; fine teeth set the size.',
    specs: [['Diameter', '48 mm'], ['Hardness', '58 HRC'], ['Coating', 'TiN']],
  },
  {
    id: 'cup',
    name: 'Grounds cup',
    text: 'Threads on in a quarter turn and holds 40 g, so a double dose never backs up into the burr.',
    specs: [['Capacity', '40 g'], ['Thread', 'Quarter-turn'], ['Finish', 'Bead-blasted']],
  },
]

/* ------------------------------------------------------------------ */
/* Brewing: methods, recipes, flavour                                   */
/* ------------------------------------------------------------------ */

export type MethodId = 'espresso' | 'aeropress' | 'v60' | 'french'

export interface Method {
  id: MethodId
  name: string
  clicks: number
  dose: number
  ratio: number
  temp: number
  /** Seconds at the base dose. */
  time: number
  flavour: { sweetness: number; acidity: number; body: number }
  doseRange: [number, number]
}

export const methods: Method[] = [
  { id: 'espresso', name: 'Espresso', clicks: 12, dose: 18, ratio: 2, temp: 93, time: 28, flavour: { sweetness: 0.72, acidity: 0.42, body: 0.92 }, doseRange: [14, 22] },
  { id: 'aeropress', name: 'AeroPress', clicks: 22, dose: 15, ratio: 15, temp: 85, time: 120, flavour: { sweetness: 0.66, acidity: 0.5, body: 0.64 }, doseRange: [11, 20] },
  { id: 'v60', name: 'V60', clicks: 30, dose: 15, ratio: 16, temp: 94, time: 180, flavour: { sweetness: 0.6, acidity: 0.82, body: 0.4 }, doseRange: [10, 30] },
  { id: 'french', name: 'French press', clicks: 44, dose: 30, ratio: 15, temp: 95, time: 240, flavour: { sweetness: 0.52, acidity: 0.34, body: 0.86 }, doseRange: [15, 45] },
]

export const methodById = Object.fromEntries(methods.map((m) => [m.id, m])) as Record<MethodId, Method>

export const grindMath = {
  clicksPerTurn: 30,
  micronsPerClick: 20,
  gramsPerTurn: 0.45,
  /** Approximate median particle size for a given click setting. */
  particle: (clicks: number) => Math.round((clicks * 24) / 10) * 10,
}

/** A full recipe from method + dose. Doses away from the base nudge grind and time. */
export function recipe(m: Method, dose: number) {
  const delta = (dose - m.dose) / m.dose
  const percolation = m.id === 'v60' || m.id === 'aeropress'
  const clicks = Math.round(m.clicks + (percolation ? delta * 6 : 0))
  const time = Math.round(m.time * (1 + (percolation ? delta * 0.35 : delta * 0.08)))
  const water = Math.round(dose * m.ratio)
  const f = m.flavour
  const clamp = (v: number) => Math.min(1, Math.max(0.05, v))
  return {
    dose,
    water,
    waterLabel: m.id === 'espresso' ? `${water} g out` : `${water} g`,
    clicks,
    microns: grindMath.particle(clicks),
    temp: m.temp,
    time,
    flavour: {
      sweetness: clamp(f.sweetness + delta * 0.06),
      acidity: clamp(f.acidity - delta * 0.12),
      body: clamp(f.body + delta * 0.16),
    },
  }
}

export const flavourWords = {
  sweetness: ['Dry', 'Clean', 'Honeyed', 'Syrupy'],
  acidity: ['Soft', 'Rounded', 'Bright', 'Sparkling'],
  body: ['Tea-like', 'Silky', 'Round', 'Heavy'],
}

export const fmtTime = (s: number) => (s < 60 ? `0:${String(s).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)

/* ------------------------------------------------------------------ */
/* Configurator                                                         */
/* ------------------------------------------------------------------ */

export type BodyFinish = 'silver' | 'black' | 'titanium' | 'forest'
export type BurrFinish = 'gold' | 'steel' | 'dark'
export type KnobWood = 'walnut' | 'oak' | 'blackwood'

export const finishes = {
  body: [
    { id: 'silver', name: 'Silver', swatch: ['#e6e4e0', '#8d8b87'] },
    { id: 'black', name: 'Matte Black', swatch: ['#3a3a3c', '#111112'] },
    { id: 'titanium', name: 'Titanium', swatch: ['#b3aca2', '#5e5952'] },
    { id: 'forest', name: 'Forest Green', swatch: ['#4d6153', '#1c2820'] },
  ],
  burr: [
    { id: 'gold', name: 'Gold', swatch: ['#e3c48a', '#8a6a35'] },
    { id: 'steel', name: 'Steel', swatch: ['#d4d3cf', '#6e6d6a'] },
    { id: 'dark', name: 'Dark coated', swatch: ['#505055', '#18181a'] },
  ],
  knob: [
    { id: 'walnut', name: 'Walnut', swatch: ['#8a5c3d', '#3a2418'] },
    { id: 'oak', name: 'Oak', swatch: ['#d2ab76', '#8c6638'] },
    { id: 'blackwood', name: 'Blackwood', swatch: ['#4a362c', '#120c09'] },
  ],
} as const

export const finishName = (group: keyof typeof finishes, id: string) =>
  (finishes[group] as readonly { id: string; name: string }[]).find((f) => f.id === id)?.name ?? id
