// "Help me write": reply suggestions in chat, and character drafts in the studio.
// Uses DeepSeek (JSON mode) when a key is set, Claude when hosted on claude.ai, else an offline template.
import { completeJSON, ApiError } from './deepseek.js';
import { getSample, sampleError, dataUrlToBlob } from './hostAI.js';
import { effectiveKey, effectiveBaseUrl, SANDBOXED, supportsVision } from './settings.js';
import { fillNames, firstName, stripMarkdown } from './format.js';
import { CATEGORIES } from '../data/characters.js';
import { SPECIES } from './portraits.js';

async function askJSON({ settings, prompt, images = [], signal, tier = 'default', requireVision = false }) {
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
  const apiKey = effectiveKey(settings);
  if (!apiKey) return { offline: true };
  const useImages = images.length && supportsVision(settings.model);
  if (requireVision && images.length && !useImages) {
    throw new ApiError(`Reading screenshots needs a vision model. Set the model to deepseek-flash in Settings.`, {
      kind: 'vision',
    });
  }
  const content = useImages
    ? [{ type: 'text', text: prompt }, ...images.map((url) => ({ type: 'image_url', image_url: { url } }))]
    : prompt;
  const value = await completeJSON({
    baseUrl: effectiveBaseUrl(settings),
    apiKey,
    signal,
    body: {
      model: settings.model,
      messages: [
        { role: 'system', content: 'You are a creative writing assistant for a character roleplay app. Reply with one JSON object only.' },
        { role: 'user', content },
      ],
      temperature: 1.0,
      max_tokens: 2200,
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
    greeting: `*{{char}} looks up as you come in, clearly not expecting company.*\n\nOh. Hi. Sorry, I wasn't— *a quick, embarrassed smile* Hi, {{user}}. What brings you here?`,
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
export async function readScreenshots({ settings, shots, signal }) {
  const order = [
    ['profile', "the character's profile or description page"],
    ['greeting', "a chat showing the character's greeting / first message"],
    ['image', 'the character\'s picture (art to use as the profile image)'],
  ].filter(([k]) => shots[k]);
  if (!order.length) throw new Error('Add at least one screenshot.');

  const list = order.map(([, label], i) => `Image ${i + 1}: ${label}`).join('\n');
  const imageIdx = order.findIndex(([k]) => k === 'image') + 1;

  const prompt = `A user is moving a roleplay character they made on another chat platform (Character.ai, Polybuzz, Talkie, Chai, Janitor and similar) over to a new app. Read their screenshots and transcribe the character.

${list}

Rules:
- Copy text exactly as shown: same wording, spelling, emoji, line breaks and *asterisks*. Do not rewrite, summarize, improve or invent anything.
- If text is cut off, copy what is visible. If a field isn't visible, use an empty string.
- Ignore app interface text (buttons, menus, ads, "This is A.I. and not a real person", like counts, the user's own messages).
- In the greeting, if the character addresses the reader by a specific username, replace that username with {{user}}.
- avatar: the square region to use as the profile picture. ${
    imageIdx
      ? `Use image ${imageIdx}: pick the region that frames the character's face/head and shoulders.`
      : 'Find the character\'s avatar picture in the screenshots (usually a circle or rounded square near the name) and give its bounding box.'
  } Coordinates are fractions (0 to 1) of that image's width and height. null if there is no usable picture.

Reply with only JSON:
{
  "name": "",
  "tagline": "",
  "description": "",
  "greeting": "",
  "creator": "creator handle without @",
  "platform": "platform name if recognizable",
  "tags": [],
  "personality": "any other visible definition/personality/scenario text, copied exactly",
  "category": "best fit: one of ${CATEGORIES.join(', ')}",
  "avatar": { "image": 1, "x": 0, "y": 0, "w": 0, "h": 0 }
}`;

  const res = await askJSON({
    settings,
    prompt,
    images: order.map(([k]) => shots[k]),
    signal,
    tier: 'default',
    requireVision: true,
  });
  if (res.offline) {
    throw new ApiError('Reading screenshots needs AI. Add your DeepSeek key in Settings (or open Charcoal inside claude.ai).', {
      kind: 'auth',
    });
  }
  const v = res.value || {};
  const str = (x, n) => (typeof x === 'string' ? x.trim().slice(0, n) : '');
  const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : null);
  let avatar = null;
  const a = v.avatar;
  if (a && typeof a === 'object') {
    const idx = Math.round(Number(a.image)) - 1;
    const box = { x: num(a.x), y: num(a.y), w: num(a.w), h: num(a.h) };
    if (order[idx] && box.x != null && box.y != null && box.w > 0.01 && box.h > 0.01) {
      avatar = { source: order[idx][0], box };
    }
  }
  if (!avatar && shots.image) avatar = { source: 'image', box: null };
  return {
    provider: res.provider,
    name: str(v.name, 40),
    tagline: str(v.tagline, 90),
    description: str(v.description, 500),
    greeting: str(v.greeting, 4096),
    creator: str(v.creator, 40).replace(/^@/, ''),
    platform: str(v.platform, 40),
    tags: (Array.isArray(v.tags) ? v.tags : []).map((t) => str(t, 24)).filter(Boolean).slice(0, 6),
    personality: str(v.personality, 3500),
    category: CATEGORIES.includes(v.category) ? v.category : 'Roleplay',
    avatar,
  };
}
