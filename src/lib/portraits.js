// Procedural anthro portrait parameters. Every combination is original art drawn by <Portrait />.
// species × fur palettes × eyes × expression × accessory × clothing gives thousands of distinct faces.

export const SPECIES = ['fox', 'wolf', 'cat', 'rabbit', 'redpanda', 'bear', 'dragon'];

export const SPECIES_LABELS = {
  fox: 'Fox',
  wolf: 'Wolf',
  cat: 'Big cat',
  rabbit: 'Rabbit',
  redpanda: 'Red panda',
  bear: 'Bear',
  dragon: 'Dragon',
};

// [fur, light fur (muzzle/chest/inner ear), accent (markings, tips)]
const FUR = {
  fox: [
    ['#e0773a', '#f6e8da', '#2f2420'],
    ['#e9edf2', '#ffffff', '#7a8494'], // arctic
    ['#9a5b3a', '#ecdccb', '#2a201c'],
    ['#6f6a73', '#e4e0e6', '#2b2830'], // silver
  ],
  wolf: [
    ['#8b9099', '#dfe2e6', '#4a4e57'],
    ['#3a3b41', '#a9abb3', '#1c1c20'],
    ['#c9b79c', '#f2ead9', '#7d6a50'],
    ['#e8e9ec', '#ffffff', '#9aa0aa'],
  ],
  cat: [
    ['#d9d5cc', '#f5f2ec', '#55524d'], // snow leopard
    ['#e5892e', '#f6e9d6', '#2a201b'], // tiger
    ['#d8a24a', '#f4e6c8', '#5b3c1c'], // leopard
    ['#2e2d33', '#56545e', '#18171b'], // panther
  ],
  rabbit: [
    ['#c8b39b', '#f3ece4', '#8a755d'],
    ['#efeae6', '#ffffff', '#c9b9b0'],
    ['#6d5a4c', '#d9c9b9', '#3d3129'],
    ['#9a9aa3', '#e6e6ea', '#5c5c66'],
  ],
  redpanda: [
    ['#c8562b', '#f7efe6', '#3b2219'],
    ['#b04a2c', '#f2e7dc', '#2f1a14'],
  ],
  bear: [
    ['#7a5235', '#c9a27e', '#3e2a1b'],
    ['#2f2a28', '#8a7a6c', '#161312'],
    ['#ece6dc', '#ffffff', '#b9ae9f'], // polar
    ['#b07a4a', '#e6c9a5', '#5e3f24'],
  ],
  dragon: [
    ['#3f8f6b', '#a9dcc0', '#e8dcc0'],
    ['#4b5bb5', '#a9b6ee', '#e9e2ce'],
    ['#8e3a4f', '#e6a9b6', '#efe3c9'],
    ['#2f2f38', '#6f6f80', '#d9b25c'],
  ],
};

// Occasional fursona-style fantasy colors
const FANTASY = [
  ['#5b7fd6', '#dbe5ff', '#26315c'],
  ['#d46aa8', '#fbe0ef', '#5c2347'],
  ['#3fb3a6', '#d6f5f0', '#1d4d48'],
  ['#8a63d2', '#e8dcff', '#352259'],
];

const EYES = ['#5aa2ff', '#7fd17a', '#f2b33d', '#c88a4a', '#9b7bff', '#e05a5a', '#47c9c2', '#d9e0ea'];
const CLOTHES = ['#2b2b33', '#3b2f4a', '#24384a', '#4a2f2a', '#2f4236', '#5a4630', '#6b2f3a', '#e7e1d6'];
export const ACCESSORIES = ['none', 'scarf', 'glasses', 'earring', 'collar', 'flower', 'bandana'];
export const EXPRESSIONS = ['open', 'happy', 'half'];

const BG = {
  fox: ['#3d1a12', '#f0a35e'],
  wolf: ['#1a2230', '#8fb4ff'],
  cat: ['#1d2a2e', '#9fd8d0'],
  rabbit: ['#2e2238', '#e6b8ff'],
  redpanda: ['#341a14', '#ffb07a'],
  bear: ['#2a2016', '#e2c08a'],
  dragon: ['#14281f', '#8fe0b5'],
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

/** Random portrait. Pass a species to keep it, or omit for any. */
export function randomPortrait({ species, seed } = {}) {
  const rnd = mulberry32(seed ?? Math.floor(Math.random() * 2 ** 31));
  const sp = species && SPECIES.includes(species) ? species : pick(rnd, SPECIES);
  const [fur, light, accent] = rnd() < 0.15 && sp !== 'dragon' ? pick(rnd, FANTASY) : pick(rnd, FUR[sp]);
  const markings =
    sp === 'cat' ? pick(rnd, ['spots', 'stripes']) : sp === 'wolf' ? pick(rnd, ['cap', 'none']) : sp === 'fox' ? 'tips' : 'none';
  return {
    kind: 'portrait',
    palette: BG[sp],
    portrait: {
      species: sp,
      fur,
      light,
      accent,
      eye: pick(rnd, EYES),
      clothes: pick(rnd, CLOTHES),
      accessory: pick(rnd, ACCESSORIES),
      expression: rnd() < 0.6 ? 'open' : pick(rnd, EXPRESSIONS),
      markings,
    },
  };
}

/** Rough count of distinct looks, for the studio label. */
export const PORTRAIT_VARIETY = SPECIES.reduce(
  (n, s) => n + (FUR[s].length + (s === 'dragon' ? 0 : FANTASY.length)) * EYES.length * CLOTHES.length * ACCESSORIES.length * EXPRESSIONS.length,
  0,
);
