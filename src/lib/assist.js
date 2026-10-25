// "Help me write": reply suggestions in chat, and character drafts in the studio.
// Uses DeepSeek (JSON mode) when a key is set, Claude when hosted on claude.ai, else an offline template.
import { completeJSON, ApiError } from './deepseek.js';
import { getSample, sampleError, dataUrlToBlob } from './hostAI.js';
import { SANDBOXED, supportsVision } from './settings.js';
import { resolveEndpoint } from './endpoint.js';
import { fillNames, firstName, stripMarkdown } from './format.js';
import { CATEGORIES } from '../data/characters.js';
import { SPECIES } from './portraits.js';

async function askJSON({ settings, prompt, images = [], signal, tier = 'default', requireVision = false, maxTokens = 2200, temperature = 1.0 }) {
  if (SANDBOXED) {
    const sample = await getSample();
    if (!sample) return { offline: true };
    try {
      const value = await sample.json(prompt, {
        signal,
        cache: false,
        modelTier: tier,
        ...(images.length ? { images: images.map(dataUrlToBlob) } : {}),
      });
      return { value, provider: 'claude' };
    } catch (e) {
      throw sampleError(e);
    }
  }
  const ep = await resolveEndpoint(settings);
  if (!ep) return { offline: true };
  const useImages = images.length && supportsVision(ep.model);
  if (requireVision && images.length && !useImages) {
    throw new ApiError(`Reading screenshots needs a vision model. Set the model to deepseek-flash in Settings.`, {
      kind: 'vision',
    });
  }
  const content = useImages
    ? [{ type: 'text', text: prompt }, ...images.map((url) => ({ type: 'image_url', image_url: { url } }))]
    : prompt;
  const value = await completeJSON({
    baseUrl: ep.baseUrl,
    apiKey: ep.apiKey,
    headers: ep.headers,
    signal,
    body: {
      model: ep.model,
      messages: [
        { role: 'system', content: 'You are a creative writing assistant for a character roleplay app. Reply with one JSON object only.' },
        { role: 'user', content },
      ],
      temperature,
      max_tokens: maxTokens,
      thinking: { type: 'disabled' },
    },
  });
  return { value, provider: 'deepseek' };
}

/* ---------------- Chat: what should I say? ---------------- */

function transcript(chat, character, persona, limit = 14) {
  const names = { user: persona.name, char: character.name };
  return chat.messages
    .slice(-limit)
    .map((m) => {
      if (m.role === 'user') {
        const img = m.images?.length ? ` [shares ${m.images.length > 1 ? 'images' : 'an image'}]` : '';
        return `${persona.name}: ${fillNames(m.text, names)}${img}`;
      }
      const v = m.variants[m.active];
      return v?.text ? `${character.name}: ${fillNames(v.text, names)}` : null;
    })
    .filter(Boolean)
    .join('\n\n')
    .slice(-9000);
}

const OFFLINE_REPLIES = [
  { label: 'Curious', text: '*leans in a little* Okay, now you have to tell me the rest. What happened next?' },
  { label: 'Playful', text: "*grins* You know I'm not going to let that go, right?" },
  { label: 'Sincere', text: '*goes quiet for a second* Honestly? That means more to me than you probably realize.' },
];

export async function suggestReplies({ settings, character, persona, chat, draft, signal }) {
  const improving = !!draft.trim();
  const prompt = `You help ${persona.name} write their next message in a roleplay chat with ${character.name} (${character.tagline || 'a character'}).
${persona.bio ? `About ${persona.name}: ${persona.bio}\n` : ''}
Recent conversation:
${transcript(chat, character, persona) || '(just started)'}

${
  improving
    ? `${persona.name} drafted this message:\n"""${draft.slice(0, 1500)}"""\n\nRewrite it three different ways. Keep their intent and point of view. Make it vivid and natural, use *asterisks* for actions, and match the scene's tone. Variation 1 stays close to the draft, 2 is more expressive, 3 is bolder.`
    : `Suggest three different things ${persona.name} could say or do next. Make each distinct: one playful, one sincere, one that moves the story forward. Use *asterisks* for actions.`
}
Write only ${persona.name}'s words and actions, never ${character.name}'s. Each option is 1 to 3 sentences.

Reply with only JSON: {"options":[{"label":"two-word label","text":"the message"}, ...]} with exactly 3 options.`;

  const res = await askJSON({ settings, prompt, signal, tier: 'quick' });
  if (res.offline) {
    if (improving) {
      const base = stripMarkdown(draft).replace(/[.!?]*$/, '');
      return {
        offline: true,
        options: [
          { label: 'Cleaner', text: `${base}.` },
          { label: 'Expressive', text: `*takes a breath* ${base}!` },
          { label: 'Bolder', text: `*meets ${firstName(character.name)}'s eyes* ${base}. And I mean it.` },
        ],
      };
    }
    return { offline: true, options: OFFLINE_REPLIES };
  }
  const options = (res.value?.options || [])
    .filter((o) => o && typeof o.text === 'string' && o.text.trim())
    .slice(0, 3)
    .map((o) => ({ label: String(o.label || '').slice(0, 24) || 'Option', text: o.text.trim() }));
  if (!options.length) throw new Error('No suggestions came back. Try again.');
  return { options, provider: res.provider };
}

/* ---------------- Studio: draft a whole character ---------------- */

const OFFLINE_NAMES = {
  fox: ['Rowan Ember', 'Sly Calloway', 'Juniper Vale', 'Ashby Fenwick', 'Kit Marlowe'],
  wolf: ['Sable Frost', 'Rook Ironfang', 'Winter Hale', 'Dusk Calder', 'Ash Mercer'],
  cat: ['Mira Spotsworth', 'Onyx Laurent', 'Saffron Kade', 'Tamsin Grey', 'Pike Lazuli'],
  rabbit: ['Clove Hopkins', 'Maple Dash', 'Bun Sterling', 'Pip Whitlock', 'Hazel Quill'],
  dragon: ['Vaelor', 'Cinder Morrow', 'Ysolde', 'Brann Ashscale', 'Teyrn'],
  default: ['Wren Calloway', 'Elias Thorne', 'Marlo Quinn', 'Juno Hart', 'Cass Merriweather'],
};

function offlineCharacter(idea) {
  const text = idea.toLowerCase();
  const species = SPECIES.find((s) => text.includes(s === 'redpanda' ? 'red panda' : s === 'cat' ? 'leopard' : s)) ||
    (/(cat|tiger|lion|lynx|panther)/.test(text) ? 'cat' : /(bunny)/.test(text) ? 'rabbit' : null);
  const names = OFFLINE_NAMES[species] || OFFLINE_NAMES.default;
  const sentence = idea.trim().replace(/\s+/g, ' ');
  const tagline = sentence.length > 88 ? `${sentence.slice(0, 85).replace(/\s+\S*$/, '')}…` : sentence;
  return {
    names,
    tagline,
    description: sentence.slice(0, 380),
    greeting: `*{{char}} looks up as you come in, clearly not expecting company.*\n\nOh. Hi. Sorry, I wasn't... *a quick, embarrassed smile* Hi, {{user}}. What brings you here?`,
    persona: `{{char}} is ${sentence}\n\nPersonality: warm, curious, a little guarded at first. Speaks casually and reacts with small physical gestures written in asterisks.`,
    examples: `{{user}}: How are you?\n{{char}}: *shrugs, but there's a smile in it* Better now that someone's here to talk to.`,
    tags: species ? ['Furry', species[0].toUpperCase() + species.slice(1)] : ['Original'],
    mood: 'Curious and a little shy',
    category: species ? 'Furry' : 'Roleplay',
    species,
  };
}

export async function draftCharacter({ settings, idea, imageDataUrl, signal }) {
  const hasImage = !!imageDataUrl;
  const prompt = `Design an ORIGINAL character for a character-roleplay chat app (like Character.ai) from this idea:
"""${idea.slice(0, 2000) || '(no description, work from the image)'}"""
${
  hasImage
    ? `\nA reference image is attached. Use it for inspiration on look, colors, outfit and vibe. Describe the character's appearance from it. If it shows a real person, don't identify them; if it shows an existing copyrighted character, invent an original character inspired by the vibe instead of copying them.\n`
    : ''
}
Write in a vivid, natural style. Use {{char}} for the character's name and {{user}} for the person chatting, exactly like that, inside greeting, persona and examples. Actions and descriptions go in *asterisks*.

Reply with only JSON in this shape:
{
  "names": ["5 distinct name ideas"],
  "tagline": "one punchy line under 90 characters",
  "description": "2-3 sentences for the public profile, under 400 characters",
  "greeting": "the opening message, 60-160 words, sets a scene and invites {{user}} in",
  "persona": "the hidden definition, 120-260 words: appearance, personality, speech style, world, relationships, what {{char}} wants",
  "examples": "2-3 short exchanges, each line starting with {{user}}: or {{char}}:, exchanges separated by a blank line",
  "tags": ["3-5 short tags"],
  "mood": "a short default mood",
  "category": "one of ${CATEGORIES.join(', ')}",
  "species": "for an anthro/furry character one of ${SPECIES.join(', ')}; otherwise null"
}`;

  const res = await askJSON({ settings, prompt, images: hasImage ? [imageDataUrl] : [], signal, tier: 'default' });
  if (res.offline) return { offline: true, ...offlineCharacter(idea || 'a mysterious stranger') };
  const v = res.value || {};
  const str = (x, n) => (typeof x === 'string' ? x.trim().slice(0, n) : '');
  return {
    provider: res.provider,
    names: (Array.isArray(v.names) ? v.names : []).map((n) => str(n, 40)).filter(Boolean).slice(0, 6),
    tagline: str(v.tagline, 90),
    description: str(v.description, 500),
    greeting: str(v.greeting, 2000),
    persona: str(v.persona, 4000),
    examples: str(v.examples, 4000),
    tags: (Array.isArray(v.tags) ? v.tags : []).map((t) => str(t, 24)).filter(Boolean).slice(0, 6),
    mood: str(v.mood, 120),
    category: CATEGORIES.includes(v.category) ? v.category : 'Roleplay',
    species: SPECIES.includes(v.species) ? v.species : null,
  };
}

/* ---------------- Port a character from screenshots ---------------- */

/**
 * Read screenshots of a character the user already has on another platform and transcribe it.
 * shots: { profile?, greeting?, image? } as data URLs. Returns the fields plus an avatar crop box.
 */
export const PORT_MAX_SHOTS = 6;

/**
 * Read screenshots of a character from another app. Returns an exact transcription (with bold/italics kept
 * as Markdown), an optional improved rewrite the model only offers when it's worth it, and where the avatar is.
 * shots: data URLs in the order the user added them.
 */
export async function readScreenshots({ settings, shots, signal }) {
  if (!shots?.length) throw new Error('Add at least one screenshot.');
  const list = shots.map((_, i) => `Image ${i + 1}`).join(', ');

  const prompt = `A user is moving a roleplay character to a new app from another chat platform (Character.ai, Polybuzz, Talkie, Chai, Janitor and similar). Read the screenshots (${list}) and transcribe the character. The screenshots can be in any order and may include: the character's profile page, the greeting / first message, an enlarged view of the avatar, the definition page.

TRANSCRIBE EXACTLY
- Copy text exactly as shown: same wording, spelling, emoji, punctuation, quotes and line breaks. Don't summarize or invent.
- Keep the styling as Markdown. Look closely at font weight and slant: text drawn in a heavier, bold weight becomes **like this**; italic text becomes *like this*; bold italic becomes ***like this***. Many apps show narration in bold and spoken dialogue in a regular weight, so wrap each bold stretch separately and leave the regular-weight parts plain. Text that already shows literal asterisks stays as written.
- Keep paragraph breaks as blank lines. Keep ((OOC notes)), ---dividers--- and similar as shown.
- If text is cut off, copy what's visible. If a field isn't visible anywhere, use "".
- Ignore app interface text: buttons, menus, tab labels, ads, "This is A.I. and not a real person", interaction and like counts, the user's own messages.
- In the greeting, if the character addresses the reader by a specific username, replace it with {{user}}.
- "greeting" is the character's ENTIRE first chat message, top to bottom: include any scene-setting or intro paragraphs that come before the dialogue. Never move part of the greeting into another field.
- "description" is the character's profile description/about text. "personality" is any other definition, scenario or personality text that's visible.

IMPROVE ONLY IF IT HELPS
After the exact copy, decide whether the writing would clearly benefit from a light edit: typos, grammar, clunky or run-on sentences, a stat list crammed into one line that reads better one item per line, inconsistent tense or POV. If it already reads well, return "improved": {}.
When you do edit: keep the same voice, facts, names, point of view and length (within about 20%). Keep the same Markdown styling convention (if narration is bold, keep it bold). Keep {{user}}. Never add new facts, kinks, backstory or lines of dialogue. Only include fields you actually changed, and give a short note (under 15 words) saying what you changed.

AVATAR
Pick the single best picture of the character to use as a profile picture: prefer an enlarged/zoomed avatar view, then a standalone character image, then the small avatar on the profile page. Give its image number and a bounding box tightly around the picture (for a round avatar, the box around the circle). Coordinates are fractions (0 to 1) of that image's width and height. "shape" is "circle" if the picture is shown as a circle, else "square". null if there's no usable picture.

Reply with only JSON:
{
  "name": "",
  "tagline": "",
  "description": "",
  "greeting": "",
  "personality": "",
  "creator": "creator handle without @",
  "platform": "platform name if recognizable",
  "tags": [],
  "category": "best fit: one of ${CATEGORIES.join(', ')}",
  "avatar": { "image": 1, "x": 0, "y": 0, "w": 0, "h": 0, "shape": "circle" },
  "improved": { "description": "", "greeting": "" },
  "improvedNote": ""
}`;

  const res = await askJSON({ settings, prompt, images: shots, signal, tier: 'default', requireVision: true, maxTokens: 7000, temperature: 0.3 });
  if (res.offline) {
    throw new ApiError('Reading screenshots needs AI. Add your DeepSeek key in Settings (or open Charcoal inside claude.ai).', {
      kind: 'auth',
    });
  }
  const v = res.value || {};
  const str = (x, n) => (typeof x === 'string' ? x.replace(/\r\n/g, '\n').trim().slice(0, n) : '');
  const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : null);
  const CAPS = { tagline: 300, description: 1500, greeting: 4096, personality: 8000 };

  let avatar = null;
  const a = v.avatar;
  if (a && typeof a === 'object') {
    const idx = Math.round(Number(a.image)) - 1;
    const box = { x: num(a.x), y: num(a.y), w: num(a.w), h: num(a.h) };
    if (shots[idx] && box.x != null && box.y != null && box.w > 0.01 && box.h > 0.01) {
      avatar = { index: idx, box, shape: a.shape === 'square' ? 'square' : 'circle' };
    }
  }

  const exact = {
    tagline: str(v.tagline, CAPS.tagline),
    description: str(v.description, CAPS.description),
    greeting: str(v.greeting, CAPS.greeting),
    personality: str(v.personality, CAPS.personality),
  };
  const improved = {};
  if (v.improved && typeof v.improved === 'object') {
    for (const k of Object.keys(CAPS)) {
      const t = str(v.improved[k], CAPS[k]);
      if (t && t !== exact[k]) improved[k] = t;
    }
  }

  return {
    provider: res.provider,
    name: str(v.name, 40),
    ...exact,
    creator: str(v.creator, 40).replace(/^@/, ''),
    platform: str(v.platform, 40),
    tags: (Array.isArray(v.tags) ? v.tags : []).map((t) => str(t, 24)).filter(Boolean).slice(0, 6),
    category: CATEGORIES.includes(v.category) ? v.category : 'Roleplay',
    avatar,
    improved,
    improvedNote: Object.keys(improved).length ? str(v.improvedNote, 140) : '',
  };
}
