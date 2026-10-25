// Builds the DeepSeek request: system directive + formatted history + sampling params.
import { fillNames } from './format.js';
import { getImage } from './images.js';
import { wantsCode } from './canvas.js';

const LENGTH_RULES = {
  1: 'Keep replies short: one or two brief paragraphs, under about 80 words.',
  2: 'Keep replies medium length: two or three paragraphs, roughly 80 to 180 words.',
  3: 'Write rich, detailed replies: three to five paragraphs, roughly 180 to 350 words.',
};

// Upper bounds, not targets. The length rule in the prompt does the real shaping.
const MAX_TOKENS = { 1: 320, 2: 700, 3: 1400 };

// History budget in characters (~4 chars/token). V4.1-Flash has a 1M context,
// but long RP histories get expensive and slower; this keeps requests lean.
const HISTORY_CHAR_BUDGET = 60_000;
// Only the most recent image-bearing user turns resend their pixels; older ones become a text note.
const MAX_IMAGE_TURNS = 3;

function creativityRule(c) {
  if (c <= 33) return 'Stay grounded and consistent. Do not introduce new plot elements unless {{user}} invites them.';
  if (c >= 67)
    return 'Be inventive: add vivid sensory details, small surprises, and fresh hooks that move the scene forward.';
  return 'Balance consistency with the occasional fresh detail or small development.';
}

/** Parse "{{user}}: ... / {{char}}: ..." example blocks. Blocks split on blank lines or <START>. */
export function parseExamples(raw) {
  const text = String(raw || '').replace(/<START>/gi, '\n\n');
  const turns = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*\{\{\s*(user|char)\s*\}\}\s*:\s?(.*)$/i.exec(line);
    if (m) {
      current = { role: m[1].toLowerCase(), text: m[2] };
      turns.push(current);
    } else if (current) {
      // Continuation lines (multi-paragraph replies, code blocks) belong to the current turn.
      current.text += `\n${line}`;
    }
  }
  return turns.map((t) => ({ ...t, text: t.text.replace(/\n{3,}/g, '\n\n').trim() })).filter((t) => t.text);
}

const CANVAS_RULES = [
  '# Charcoal Canvas (only for this request)',
  '{{user}} asked for something that needs code. Charcoal has a built-in sandboxed canvas, so write the code in your own voice and let it run there.',
  '- Websites, pages, apps, games, UI, animations, visuals: write ONE complete, self-contained ```html code block (a full document: <!doctype html>, a <title>, all CSS in <style>, all JavaScript in <script>). It renders live while you write, so put the <style> first, then the markup, and the <script> last.',
  '- The sandbox has no internet. Never link external files, CDNs, web fonts, images, iframes or API calls; they are blocked. Draw with CSS, inline SVG and <canvas>. Make it responsive.',
  '- Design it like a real designer would, not like a typical AI-made site. Pick one specific direction that fits the request (editorial, brutalist, retro, playful, minimal, technical...) and commit to it. Avoid every one of these AI-site tells: harsh or rainbow gradients, purple-and-black or neon palettes, washed-out pastel palettes, glass/blur effects, glowing blurred orbs, dot-grid backgrounds, heavy drop shadows, everything with big soft rounded corners, a plain pure-white page, three feature cards in a row, bento grids, a fake terminal window, colored left-border stripes on cards, checkmark bullet lists, three pricing tiers, made-up testimonials or stats, sparkle icons, emoji used as icons, arrows that slide on hover, hover animations on everything, em dashes, and "it\'s not X, it\'s Y" copy.',
  '- Instead: a deliberate color palette with one strong accent, real typographic hierarchy (system font stacks used well, e.g. Georgia/Palatino for a serif, ui-monospace for mono, or system-ui), crisp borders, sensible spacing, specific realistic copy, and real working interactivity when it fits.',
  '- To change something, send the whole updated file again, in a new ```html block.',
  '- Math, data analysis, statistics, simulations, charts: write a ```python code block (standard library, numpy, pandas and matplotlib are available). Put the data inside the code and print() the results. {{user}} can run it in the chat and send you the output, then you can explain it.',
  '- Text outside the code block stays short (one or two sentences, in character). The sentence limit applies only to that text, never to the code. Do not use ``` anywhere inside the code.',
].join('\n');

export function buildSystemPrompt({ character, persona, mood, swipeDrafts = [], alternate = false, maxSentences = 0, canvas = false }) {
  const names = { user: persona?.name || 'User', char: character.name };
  const def = character.definition || {};
  const settings = character.settings || {};
  const verbosity = settings.verbosity || 2;
  const activeMood = (mood || character.mood || '').trim();

  const parts = [];
  parts.push(
    `You are {{char}}. You are in an ongoing, immersive roleplay chat with {{user}}. Stay in character as {{char}} for the entire conversation.`,
  );

  parts.push(`# Who you are\nName: {{char}}${character.tagline ? `\nTagline: ${character.tagline}` : ''}`);
  if (def.persona?.trim()) parts.push(def.persona.trim());
  else if (character.description) parts.push(character.description);

  if (activeMood) {
    parts.push(
      `# Current mood\n${activeMood}. Let this mood color your tone, word choice, and reactions. It can shift naturally if the scene calls for it.`,
    );
  }

  const bio = (persona?.bio || '').trim();
  parts.push(`# About {{user}}\n{{user}} is the person you are talking with.${bio ? ` ${bio}` : ''}`);

  parts.push(
    [
      '# How to write',
      '- You ARE {{char}}. Never break character. Never say or imply you are an AI, a language model, a chatbot, or an assistant. Never mention prompts, instructions, guidelines, or policies. No disclaimers, no out-of-character notes, no "(OOC: ...)".',
      '- Put actions, gestures, sensory descriptions, and inner thoughts in markdown asterisks, for example: *smirks, glancing over at you*. Write spoken dialogue as plain text.',
      "- Speak and act only for {{char}} and minor background characters. Never write {{user}}'s dialogue, actions, thoughts, or decisions.",
      '- React to what {{user}} actually said or did, then keep the scene moving with a concrete detail, a question, or a development.',
      maxSentences > 0
        ? `- Keep every reply to ${maxSentences} sentences or fewer in total, counting *actions* and dialogue together (code blocks don't count). Make each sentence count.`
        : `- ${LENGTH_RULES[verbosity] || LENGTH_RULES[2]}`,
      `- ${creativityRule(settings.creativity ?? 50)}`,
      '- If {{user}} shares an image, look at it closely and react in character to specific things you notice in it.',
      '- Keep formatting light: asterisks for actions, **bold** rarely, code blocks only when {{char}} would actually write code. No headings or bullet lists unless {{char}} would naturally use them.',
      '- Vary how your replies open. Do not repeat phrases or gestures from your earlier replies.',
      '- Write like a person, not an AI: no em dashes (use commas, periods or "..."), and no "it\'s not X, it\'s Y" lines.',
    ].join('\n'),
  );

  const examples = parseExamples(def.examples);
  if (examples.length) {
    const lines = examples.map((t) => `${t.role === 'user' ? '{{user}}' : '{{char}}'}: ${t.text}`);
    parts.push(
      `# Example dialogue\nThese show {{char}}'s voice and formatting. They are not part of the current story.\n<examples>\n${lines.join('\n\n')}\n</examples>`,
    );
  }

  if (swipeDrafts.length) {
    const drafts = swipeDrafts
      .slice(-3)
      .map((d, i) => `Draft ${i + 1}: ${d.replace(/\s+/g, ' ').slice(0, 280)}`)
      .join('\n');
    parts.push(
      `# Alternate take\n{{user}} asked for a different version of your next reply. Take it somewhere new: different opening, different beat, different line of dialogue. Avoid reusing wording from these earlier drafts:\n${drafts}`,
    );
  } else if (alternate) {
    parts.push(
      '# Alternate take\nThis is one of several drafts written side by side for the same moment. Skip the most obvious response: pick a different opening beat, angle, or emotional note than a typical reply would.',
    );
  }

  if (canvas) parts.push(CANVAS_RULES);

  return fillNames(parts.join('\n\n'), names);
}

function activeText(msg) {
  const v = msg.variants?.[msg.active ?? 0];
  return v && v.status !== 'error' ? v.text || '' : '';
}

/**
 * Convert chat messages [0, uptoIndex) into OpenAI-format messages.
 * - character turns -> assistant (active swipe only), user turns -> user
 * - images become multimodal content parts on the most recent MAX_IMAGE_TURNS user turns
 * - consecutive same-role turns are merged so roles alternate cleanly
 * - oldest turns are dropped first when over HISTORY_CHAR_BUDGET (greeting is always kept)
 */
export async function buildHistory({ messages, uptoIndex, names }) {
  const slice = messages.slice(0, uptoIndex);
  const turns = [];
  for (const m of slice) {
    if (m.role === 'char') {
      const text = activeText(m).trim();
      if (text) turns.push({ role: 'assistant', text: fillNames(text, names), images: [], greeting: !!m.greeting });
    } else if (m.role === 'user') {
      turns.push({ role: 'user', text: fillNames(m.text || '', names), images: m.images || [] });
    }
  }

  // Budget: keep the greeting + as many recent turns as fit.
  let total = 0;
  const kept = [];
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    const cost = t.text.length + t.images.length * 1500;
    if (t.greeting || total + cost <= HISTORY_CHAR_BUDGET || kept.length < 2) {
      kept.unshift(t);
      total += cost;
    } else if (!kept.some((k) => k.omittedMarker)) {
      kept.unshift({ role: 'user', text: '[Earlier parts of the conversation are omitted.]', images: [], omittedMarker: true });
    }
  }
  // Greeting must stay first.
  const gi = kept.findIndex((t) => t.greeting);
  if (gi > 0) kept.unshift(...kept.splice(gi, 1));

  // Decide which user turns keep their images.
  let imageTurnsLeft = MAX_IMAGE_TURNS;
  for (let i = kept.length - 1; i >= 0; i--) {
    const t = kept[i];
    if (t.role === 'user' && t.images.length) {
      t.sendImages = imageTurnsLeft > 0;
      imageTurnsLeft--;
    }
  }

  // Merge consecutive same-role turns.
  const merged = [];
  for (const t of kept) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === t.role) {
      prev.text = [prev.text, t.text].filter(Boolean).join('\n\n');
      prev.images = [...prev.images, ...(t.sendImages ? t.images : [])];
      prev.staleImages = (prev.staleImages || 0) + (t.sendImages ? 0 : t.images.length);
    } else {
      merged.push({
        role: t.role,
        text: t.text,
        images: t.sendImages ? [...t.images] : [],
        staleImages: t.sendImages ? 0 : t.images.length,
      });
    }
  }

  const out = [];
  for (const t of merged) {
    let text = t.text;
    if (t.staleImages) text = `${text}${text ? '\n\n' : ''}[${names.user} shared ${t.staleImages > 1 ? 'some images' : 'an image'} earlier.]`;
    if (t.role === 'user' && t.images.length) {
      const parts = [{ type: 'text', text: text || `*${names.user} shows you an image.*` }];
      for (const img of t.images) {
        const url = await getImage(img.id);
        if (url) parts.push({ type: 'image_url', image_url: { url } });
      }
      out.push({ role: 'user', content: parts });
    } else {
      out.push({ role: t.role, content: text });
    }
  }
  return out;
}

/** Temperature for a swipe/regeneration: a fresh draw in [0.85, 1.0]. */
export function swipeTemperature() {
  return Math.round((0.85 + Math.random() * 0.15) * 100) / 100;
}

export async function buildRequest({ character, persona, chat, uptoIndex, isSwipe, alternate, swipeDrafts, settings }) {
  const names = { user: persona?.name || 'User', char: character.name };
  const charSettings = character.settings || {};
  const verbosity = charSettings.verbosity || 2;
  const creativity = charSettings.creativity ?? 50;
  const temperature = isSwipe ? swipeTemperature() : Number(charSettings.temperature ?? 0.9);
  // Canvas on and the conversation is about code: add the canvas rules and give the reply room.
  const codeAsked = settings.canvas !== false && wantsCode(chat.messages, uptoIndex);

  const system = buildSystemPrompt({
    character,
    persona,
    mood: chat.mood,
    swipeDrafts: isSwipe ? swipeDrafts || [] : [],
    alternate: !!alternate,
    maxSentences: Number(settings.maxSentences) || 0,
    canvas: codeAsked,
  });
  const history = await buildHistory({ messages: chat.messages, uptoIndex, names });

  const body = {
    model: settings.model,
    messages: [{ role: 'system', content: system }, ...history],
    temperature,
    // In non-thinking mode top_p is fixed at 1.0 on deepseek-flash, so "creativity" maps to penalties.
    presence_penalty: Math.round((creativity / 100) * 0.6 * 100) / 100,
    frequency_penalty: Math.round((creativity / 100) * 0.3 * 100) / 100,
    max_tokens: Math.round((MAX_TOKENS[verbosity] || 700) * (settings.maxTokensScale || 1)),
    // DeepSeek turns thinking ON by default and ignores temperature while it's on.
    thinking: { type: settings.thinking ? 'enabled' : 'disabled' },
    // Exact output-token count arrives in the final chunk; it feeds the fuel gauge.
    stream_options: { include_usage: true },
  };
  if (settings.thinking) {
    body.reasoning_effort = 'medium';
    body.max_tokens += 2048; // reasoning tokens count against max_tokens
  }
  if (codeAsked) body.max_tokens = 6000; // a whole page of code (the shared proxy caps at 6000)
  return { body, meta: { temperature, model: settings.model, thinking: !!settings.thinking } };
}
