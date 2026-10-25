import {
  BookOpen,
  Bot,
  Brain,
  Cat,
  CodeXml,
  Coffee,
  Crown,
  Drama,
  Feather,
  Flame,
  Gamepad2,
  Ghost,
  GraduationCap,
  Heart,
  Leaf,
  Lighthouse,
  Moon,
  Mountain,
  Rocket,
  Scale,
  Ship,
  Skull,
  Soup,
  Sparkles,
  Store,
  Swords,
  Telescope,
  Timer,
  WandSparkles,
  Waves,
} from './icons.jsx';

export const EMBLEMS = {
  Moon,
  Soup,
  Sparkles,
  Ship,
  Timer,
  Store,
  CodeXml,
  GraduationCap,
  Lighthouse,
  Scale,
  Flame,
  Feather,
  Ghost,
  Cat,
  Swords,
  BookOpen,
  Gamepad2,
  Rocket,
  Leaf,
  Heart,
  Skull,
  Crown,
  Coffee,
  Waves,
  Brain,
  Bot,
  Drama,
  Mountain,
  WandSparkles,
  Telescope,
};

// [base, glow] pairs for generated avatars
export const PALETTES = [
  ['#2b2140', '#c9a2ff'],
  ['#3d1a12', '#f0a35e'],
  ['#3f1d3a', '#ffa8d2'],
  ['#1f2f22', '#e3c27a'],
  ['#10302f', '#7fe0cc'],
  ['#15263d', '#7aa7ff'],
  ['#361a22', '#ff9a8f'],
  ['#132a35', '#f0cc85'],
  ['#1d2a14', '#a8e07a'],
  ['#2a1630', '#e39cff'],
  ['#2a2a2e', '#d8d8de'],
  ['#331f0c', '#ffcf6b'],
];

// Words in a "describe a vibe" prompt that steer the avatar generator.
const EMBLEM_WORDS = [
  [/moon|night|star|dark|vampire|goth/, 'Moon'],
  [/sword|knight|samurai|blade|warrior|fight/, 'Swords'],
  [/code|program|dev|engineer|hacker|computer/, 'CodeXml'],
  [/cat|kitten|neko/, 'Cat'],
  [/sea|ocean|sail|pirate|ship|water/, 'Ship'],
  [/wave|surf|beach/, 'Waves'],
  [/fire|flame|dragon|ember|burn/, 'Flame'],
  [/book|library|read|scholar|write|poet/, 'BookOpen'],
  [/game|gamer|arcade|play/, 'Gamepad2'],
  [/ghost|spirit|haunt/, 'Ghost'],
  [/space|rocket|astronaut|alien/, 'Rocket'],
  [/forest|nature|plant|druid|garden/, 'Leaf'],
  [/love|romance|heart|sweet/, 'Heart'],
  [/skull|death|necro|pirate captain/, 'Skull'],
  [/king|queen|prince|princess|royal/, 'Crown'],
  [/coffee|cafe|barista/, 'Coffee'],
  [/mind|psych|philosoph|think/, 'Brain'],
  [/robot|android|ai|cyborg/, 'Bot'],
  [/theater|actor|drama|mask/, 'Drama'],
  [/mountain|hike|climb/, 'Mountain'],
  [/magic|wizard|witch|mage|spell/, 'WandSparkles'],
  [/telescope|astronom|science/, 'Telescope'],
  [/teacher|tutor|study|school/, 'GraduationCap'],
  [/food|chef|cook|ramen/, 'Soup'],
];

const COLOR_WORDS = [
  [/purple|violet|lavender/, 0],
  [/orange|amber|warm/, 1],
  [/pink|rose|cute/, 2],
  [/gold|brass|treasure/, 3],
  [/teal|cyan|mint|aqua/, 4],
  [/blue|ice|cold/, 5],
  [/red|crimson|blood/, 6],
  [/green|lime|nature/, 8],
  [/grey|gray|silver|mono/, 10],
  [/yellow|sun/, 11],
];

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic avatar from a short description; keywords steer the emblem and color. */
export function generateAvatar(prompt, salt = 0) {
  const text = String(prompt || '').toLowerCase();
  const h = hash(`${text}#${salt}`);
  const emblemNames = Object.keys(EMBLEMS);
  const emblem = EMBLEM_WORDS.find(([re]) => re.test(text))?.[1] || emblemNames[h % emblemNames.length];
  const colorIdx = COLOR_WORDS.find(([re]) => re.test(text))?.[1];
  const palette = PALETTES[colorIdx ?? (h >>> 5) % PALETTES.length];
  return { kind: 'generated', palette, emblem };
}
