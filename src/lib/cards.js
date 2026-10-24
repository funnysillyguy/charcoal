// Character card import: Tavern V1/V2/V3 JSON, and PNG cards with the JSON embedded
// in a tEXt/iTXt chunk ("chara" or "ccv3"). Creator name and source link carry over so the
// original maker stays credited.

function readPngTextChunks(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!sig.every((b, i) => bytes[i] === b)) throw new Error("That PNG isn't valid.");
  const latin1 = new TextDecoder('latin1');
  const utf8 = new TextDecoder('utf-8');
  const out = {};
  let p = 8;
  while (p + 8 <= bytes.length) {
    const len = view.getUint32(p);
    const type = latin1.decode(bytes.subarray(p + 4, p + 8));
    const data = bytes.subarray(p + 8, p + 8 + len);
    if (type === 'tEXt') {
      const z = data.indexOf(0);
      if (z > 0) out[latin1.decode(data.subarray(0, z))] = latin1.decode(data.subarray(z + 1));
    } else if (type === 'iTXt') {
      const z = data.indexOf(0);
      const key = latin1.decode(data.subarray(0, z));
      const compressed = data[z + 1];
      let q = z + 3;
      q = data.indexOf(0, q) + 1; // language tag
      q = data.indexOf(0, q) + 1; // translated keyword
      if (!compressed && q > 0) out[key] = utf8.decode(data.subarray(q));
    } else if (type === 'IEND') break;
    p += 12 + len;
  }
  return out;
}

function decodeBase64Json(text) {
  const bin = atob(text.trim());
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder('utf-8').decode(bytes));
}

function firstSentence(text, max = 90) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const s = (/^.*?[.!?](\s|$)/.exec(clean)?.[0] || clean).trim();
  return s.length > max ? `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : s;
}

function normalizeExamples(raw) {
  return String(raw || '')
    .replace(/<START>/gi, '\n')
    .replace(/\{\{\s*user\s*\}\}\s*:/gi, '{{user}}:')
    .replace(/\{\{\s*char\s*\}\}\s*:/gi, '{{char}}:')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Map any supported card JSON to Charcoal's character form fields. */
export function cardToForm(card) {
  const d = card?.data && (card.spec || card.data.name) ? card.data : card;
  if (!d || !d.name) throw new Error("This file doesn't look like a character card (no name found).");
  const ext = d.extensions || {};
  const chubPath = ext.chub?.full_path;
  const sourceUrl = chubPath ? `https://chub.ai/characters/${chubPath}` : ext.source_url || d.source || '';
  const persona = [
    d.description,
    d.personality ? `Personality: ${d.personality}` : '',
    d.scenario ? `Scenario: ${d.scenario}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim();
  const greetings = [d.first_mes, ...(Array.isArray(d.alternate_greetings) ? d.alternate_greetings : [])].filter(
    (g) => g && String(g).trim(),
  );
  return {
    name: String(d.name).slice(0, 40),
    tagline: firstSentence(d.creator_notes || d.description),
    description: String(d.creator_notes || d.description || '').replace(/\s+/g, ' ').trim().slice(0, 500),
    greetings: greetings.slice(0, 5).map((g) => String(g).slice(0, 4096)),
    persona: persona.slice(0, 4000),
    examples: normalizeExamples(d.mes_example).slice(0, 4000),
    tags: (Array.isArray(d.tags) ? d.tags : []).slice(0, 6).join(', '),
    creator: String(d.creator || '').replace(/^@/, '').slice(0, 40),
    sourceUrl: String(sourceUrl).slice(0, 300),
  };
}

/** Read a .json or .png card file. Returns { form, avatarFile } (avatarFile = the PNG itself). */
export async function readCardFile(file) {
  const isPng = file.type === 'image/png' || /\.png$/i.test(file.name);
  if (isPng) {
    const chunks = readPngTextChunks(await file.arrayBuffer());
    const raw = chunks.ccv3 || chunks.chara;
    if (!raw) throw new Error('No character data found in that PNG. It may be a plain image, not a card.');
    return { form: cardToForm(decodeBase64Json(raw)), avatarFile: file };
  }
  const text = await file.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  return { form: cardToForm(json), avatarFile: null };
}
