// Creation studio as a full page: centered avatar with an edit badge, one scrolling form,
// counters under each field, up to five greetings, Help me write at the top, card import.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  FileUp,
  Globe,
  ImagePlus,
  Link2,
  Loader,
  Lock,
  Menu,
  Pencil,
  Plus,
  ScanText,
  Shuffle,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X,
} from '../components/icons.jsx';
import Avatar from '../components/Avatar.jsx';
import HelpWriteIcon from '../components/HelpWriteIcon.jsx';
import ScreenshotPort from '../components/ScreenshotPort.jsx';
import { usePopover, useUI } from '../components/ui.jsx';
import { Markdown } from '../lib/markdown.jsx';
import { useStore, useActivePersona, useSettings } from '../lib/store.jsx';
import { CATEGORIES } from '../data/characters.js';
import { generateAvatar } from '../components/emblems.js';
import { randomPortrait, SPECIES, SPECIES_LABELS, PORTRAIT_VARIETY } from '../lib/portraits.js';
import { prepareAvatar, prepareImage, uid } from '../lib/images.js';
import { dataUrlToBlob } from '../lib/hostAI.js';
import { draftCharacter } from '../lib/assist.js';
import { readCardFile } from '../lib/cards.js';
import { fillNames, formatCount } from '../lib/format.js';

const LIMITS = { name: 40, tagline: 300, description: 1500, greeting: 4096, persona: 8000, mood: 120, examples: 4000 };
const MAX_GREETINGS = 5;

const VISIBILITY = [
  { id: 'public', label: 'Public', icon: Globe, hint: 'Listed on Discover and in search.' },
  { id: 'unlisted', label: 'Unlisted', icon: Link2, hint: 'Only in your Custom tab and search.' },
  { id: 'private', label: 'Private', icon: Lock, hint: 'Only you.' },
];
const VERBOSITY = ['Short', 'Balanced', 'Long'];

function emptyForm(persona) {
  return {
    id: null,
    name: '',
    tagline: '',
    description: '',
    greetings: [''],
    category: 'Furry',
    tags: '',
    persona: '',
    mood: '',
    examples: '',
    visibility: 'public',
    creativity: 60,
    temperature: 0.9,
    verbosity: 2,
    avatar: randomPortrait(),
    creator: persona.name,
    sourceUrl: '',
    basedOn: null,
  };
}

function formFromCharacter(c, { remix, persona }) {
  return {
    id: remix ? null : c.id,
    name: c.name,
    tagline: c.tagline || '',
    description: c.description || '',
    greetings: c.greetings?.length ? c.greetings.slice(0, MAX_GREETINGS) : [''],
    category: CATEGORIES.includes(c.category) ? c.category : 'Roleplay',
    tags: (c.tags || []).join(', '),
    persona: c.definition?.persona || '',
    mood: c.mood || '',
    examples: c.definition?.examples || '',
    visibility: remix ? 'private' : c.visibility || 'public',
    creativity: c.settings?.creativity ?? 60,
    temperature: c.settings?.temperature ?? 0.9,
    verbosity: c.settings?.verbosity ?? 2,
    avatar: c.avatar,
    creator: remix ? persona.name : c.creator || persona.name,
    sourceUrl: remix ? '' : c.sourceUrl || '',
    basedOn: remix ? { name: c.name, creator: c.creator } : c.basedOn || null,
    interactions: remix ? 0 : c.interactions || 0,
    createdAt: remix ? undefined : c.createdAt,
  };
}

function Field({ id, label, value, max, error, hint, children }) {
  return (
    <div className="cfield">
      <label className="cfield-label" htmlFor={id}>
        {label}
      </label>
      {children}
      <div className="cfield-foot">
        <span className={error ? 'field-error' : 'field-hint'}>{error || hint || ''}</span>
        {max != null && (
          <span className={`count ${value.length > max ? 'over' : ''}`}>
            {value.length}/{max}
          </span>
        )}
      </div>
    </div>
  );
}

function Range({ id, value, min, max, step, onChange, format }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="range-row">
      <input
        id={id}
        className="range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--pct': `${pct}%` }}
      />
      <span className="range-value">{format ? format(value) : value}</span>
    </div>
  );
}

/* ---------- Help me write ---------- */
function StudioHelper({ onApply }) {
  const { settings } = useSettings();
  const ui = useUI();
  const [idea, setIdea] = useState('');
  const [ref, setRef] = useState(null);
  const [useAsAvatar, setUseAsAvatar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [chosen, setChosen] = useState(0);
  const fileRef = useRef(null);
  const ctlRef = useRef(null);
  useEffect(() => () => ctlRef.current?.abort(), []);

  const run = async () => {
    if (!idea.trim() && !ref) {
      setError('Describe the character or add a reference image first.');
      return;
    }
    ctlRef.current?.abort();
    const ctl = new AbortController();
    ctlRef.current = ctl;
    setBusy(true);
    setError('');
    try {
      const r = await draftCharacter({ settings, idea, imageDataUrl: ref?.dataUrl, signal: ctl.signal });
      setResult(r);
      setChosen(0);
    } catch (e) {
      if (e?.name !== 'AbortError') setError(e?.message || 'The draft failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!result) return;
    let avatar = null;
    if (useAsAvatar && ref) {
      try {
        avatar = { kind: 'image', src: await prepareAvatar(dataUrlToBlob(ref.dataUrl)) };
      } catch {
        avatar = null;
      }
    }
    if (!avatar && result.species) avatar = randomPortrait({ species: result.species });
    onApply({
      name: result.names[chosen] || result.names[0] || '',
      tagline: result.tagline,
      description: result.description,
      greetings: [result.greeting || ''],
      persona: result.persona,
      examples: result.examples,
      tags: result.tags.join(', '),
      mood: result.mood,
      category: result.category,
      ...(avatar ? { avatar } : {}),
    });
    ui.toast('Draft applied. Edit anything you like.', 'ok');
  };

  return (
    <section className="helper">
      <header className="helper-head">
        <span className="help-tile">
          <HelpWriteIcon size={16} />
        </span>
        <div>
          <h3>Help me write</h3>
          <p>Describe the character and add an image for inspiration. You'll get names, a greeting and a full definition.</p>
        </div>
      </header>
      <div className="helper-input">
        <textarea
          id="helper-idea"
          className="textarea"
          rows={3}
          value={idea}
          maxLength={2000}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="A grumpy arctic fox lighthouse mechanic who secretly writes poetry"
        />
        <div className="helper-row">
          {ref ? (
            <div className="helper-ref">
              <img src={ref.dataUrl} alt="Reference" />
              <button type="button" className="attachment-remove" onClick={() => setRef(null)} aria-label="Remove image">
                <X size={12} />
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
              <ImagePlus size={14} /> Reference image
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                setRef(await prepareImage(f));
              } catch (err) {
                setError(err.message);
              }
            }}
          />
          {ref && (
            <label className="check-label">
              <input type="checkbox" checked={useAsAvatar} onChange={(e) => setUseAsAvatar(e.target.checked)} />
              Use as avatar
            </label>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-primary btn-sm" onClick={run} disabled={busy}>
            {busy ? <Loader size={14} className="spin" /> : <Sparkles size={14} />}
            {result ? 'Draft again' : 'Draft it'}
          </button>
        </div>
      </div>
      {error && <p className="field-error">{error}</p>}
      {busy && !result && (
        <div className="helper-skeleton" aria-label="Drafting">
          <span />
          <span />
          <span />
        </div>
      )}
      {result && (
        <div className={`helper-result ${busy ? 'stale' : ''}`}>
          {result.offline && <p className="field-hint">Offline template. Add a DeepSeek key in Settings, or open Charcoal in claude.ai, for real drafts.</p>}
          <div className="eyebrow">Pick a name</div>
          <div className="name-chips">
            {result.names.map((n, i) => (
              <button key={n + i} type="button" className={`chip chip-btn ${chosen === i ? 'active' : ''}`} onClick={() => setChosen(i)}>
                {n}
              </button>
            ))}
          </div>
          {result.tagline && <p className="helper-tagline">{result.tagline}</p>}
          {result.greeting && (
            <div className="helper-greeting">
              <Markdown text={fillNames(result.greeting, { char: result.names[chosen] || 'them', user: 'you' })} />
            </div>
          )}
          <div className="helper-actions">
            <span className="field-hint">Fills every field below. You can still edit all of it.</span>
            <button type="button" className="btn btn-glow btn-sm" onClick={apply} disabled={busy}>
              Use this draft
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------- Avatar with edit badge ---------- */
function AvatarPicker({ avatar, name, onChange }) {
  const ui = useUI();
  const pop = usePopover();
  const [species, setSpecies] = useState(avatar?.portrait?.species || 'fox');
  const [vibe, setVibe] = useState('');
  const salt = useRef(0);
  const fileRef = useRef(null);

  return (
    <div className="cavatar pop-anchor" ref={pop.ref}>
      <button type="button" className="cavatar-btn" onClick={pop.toggle} aria-label="Change avatar" aria-expanded={pop.open}>
        <Avatar avatar={avatar} name={name || '?'} size={150} radius={26} />
        <span className="cavatar-badge">
          <Pencil size={22} />
        </span>
      </button>
      {pop.open && (
        <div className="popover cavatar-pop" role="dialog" aria-label="Avatar">
          <div className="eyebrow pop-title">Portrait · {formatCount(PORTRAIT_VARIETY)}+ looks</div>
          <div className="avatar-row">
            <select
              id="portrait-species"
              className="select"
              value={species}
              onChange={(e) => {
                setSpecies(e.target.value);
                onChange(randomPortrait({ species: e.target.value }));
              }}
            >
              {SPECIES.map((s) => (
                <option key={s} value={s}>
                  {SPECIES_LABELS[s]}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(randomPortrait({ species }))}>
              <Shuffle size={14} /> Shuffle
            </button>
          </div>
          <div className="eyebrow pop-title">Emblem</div>
          <div className="avatar-row">
            <input id="emblem-vibe" className="input" value={vibe} onChange={(e) => setVibe(e.target.value)} placeholder="purple moon witch" />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(generateAvatar(vibe || name, salt.current++))}>
              <Wand2 size={14} /> Make
            </button>
          </div>
          <div className="eyebrow pop-title">Your image</div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
            <Upload size={14} /> Upload (art you own)
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                onChange({ kind: 'image', src: await prepareAvatar(f) });
                pop.setOpen(false);
              } catch (err) {
                ui.toast(err.message, 'error');
              }
            }}
          />
        </div>
      )}
    </div>
  );
}

/* ---------- Page ---------- */
export default function CharacterCreator({ init, onClose }) {
  const { dispatch } = useStore();
  const persona = useActivePersona();
  const ui = useUI();
  const [form, setForm] = useState(() =>
    init?.character
      ? formFromCharacter(init.character, { remix: !!init.remix, persona })
      : { ...emptyForm(persona), ...(init?.name ? { name: init.name } : {}) },
  );
  const [touched, setTouched] = useState(false);
  const [portOpen, setPortOpen] = useState(!!init?.port);
  const importRef = useRef(null);
  const scrollRef = useRef(null);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setGreeting = (i, v) => setForm((f) => ({ ...f, greetings: f.greetings.map((g, j) => (j === i ? v : g)) }));
  const editing = !!form.id;

  const errors = useMemo(() => {
    const e = {};
    if (!form.name.trim()) e.name = 'Give your character a name.';
    if (!form.greetings[0]?.trim()) e.greeting = 'Write the first thing they say.';
    for (const k of ['name', 'tagline', 'description', 'persona', 'mood', 'examples'])
      if ((form[k] || '').length > LIMITS[k]) e[k] = `Keep this under ${LIMITS[k]} characters.`;
    if (form.greetings.some((g) => g.length > LIMITS.greeting)) e.greeting = `Keep greetings under ${LIMITS.greeting} characters.`;
    return e;
  }, [form]);

  const save = () => {
    setTouched(true);
    if (Object.keys(errors).length) {
      scrollRef.current?.querySelector('.invalid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const now = Date.now();
    const character = {
      id: form.id || uid('char'),
      name: form.name.trim(),
      tagline: form.tagline.trim(),
      description: form.description.trim(),
      greetings: form.greetings.map((g) => g.trim()).filter(Boolean),
      category: form.category,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 8),
      creator: (form.creator || persona.name).replace(/^@/, '').trim() || persona.name,
      sourceUrl: form.sourceUrl.trim(),
      basedOn: form.basedOn,
      avatar: form.avatar,
      mood: form.mood.trim(),
      definition: { persona: form.persona.trim(), examples: form.examples.trim() },
      settings: { creativity: form.creativity, temperature: form.temperature, verbosity: form.verbosity },
      visibility: form.visibility,
      interactions: form.interactions || 0,
      createdAt: form.createdAt || now,
      updatedAt: now,
    };
    dispatch({ type: 'character/save', character });
    onClose();
    if (editing) ui.toast(`Saved ${character.name}`, 'ok');
    else ui.openChat({ ...character, custom: true });
  };

  const onImport = async (file) => {
    try {
      const { form: f, avatarFile } = await readCardFile(file);
      let avatar = form.avatar;
      if (avatarFile) {
        try {
          avatar = { kind: 'image', src: await prepareAvatar(avatarFile) };
        } catch {
          /* keep current avatar */
        }
      }
      setForm((cur) => ({
        ...cur,
        ...f,
        greetings: f.greetings?.length ? f.greetings : cur.greetings,
        id: cur.id,
        creator: f.creator || cur.creator,
        tags: f.tags || cur.tags,
        avatar,
        visibility: 'private',
      }));
      ui.toast(`Imported ${f.name}${f.creator ? ` by @${f.creator}` : ''}`, 'ok');
    } catch (e) {
      ui.toast(e.message || "Couldn't read that card.", 'error');
    }
  };

  const err = (k) => (touched ? errors[k] : '');

  return (
    <div className="page creator">
      <header className="creator-top">
        <button type="button" className="icon-btn nav-menu" onClick={ui.openDrawer} aria-label="Open menu">
          <Menu size={22} />
        </button>
        <button type="button" className="creator-back" onClick={onClose} aria-label="Back">
          <ChevronLeft size={20} />
          <span>{editing ? 'Edit character' : form.basedOn ? 'Remix' : 'Create a character'}</span>
        </button>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className={`creator-link ${portOpen ? 'on' : ''}`}
          onClick={() => setPortOpen((o) => !o)}
          aria-pressed={portOpen}
          aria-label="Port from screenshots"
        >
          <ScanText size={16} /> <span>Port from screenshots</span>
        </button>
        <button type="button" className="creator-link" onClick={() => importRef.current?.click()} aria-label="Import card">
          <FileUp size={16} /> <span>Import card</span>
        </button>
        <input
          ref={importRef}
          type="file"
          accept=".png,.json,image/png,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onImport(f);
          }}
        />
      </header>

      <div className="page-scroll" ref={scrollRef}>
        <div className="creator-body">
          {portOpen && (
            <ScreenshotPort
              onClose={() => setPortOpen(false)}
              onApply={(patch) => {
                set(patch);
                setPortOpen(false);
                scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          )}
          <AvatarPicker avatar={form.avatar} name={form.name} onChange={(avatar) => set({ avatar })} />
          {form.basedOn && (
            <p className="creator-note">
              Remix of {form.basedOn.name} by @{form.basedOn.creator}. Credit stays on the profile.
            </p>
          )}

          {!editing && <StudioHelper onApply={(patch) => set(patch)} />}

          <Field id="c-name" label="Character name" value={form.name} max={LIMITS.name} error={err('name')}>
            <input id="c-name" className={`cinput ${err('name') ? 'invalid' : ''}`} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Rhett Ashby" />
          </Field>
          <Field id="c-tagline" label="Tagline" value={form.tagline} max={LIMITS.tagline} error={err('tagline')}>
            <input id="c-tagline" className="cinput" value={form.tagline} onChange={(e) => set({ tagline: e.target.value })} placeholder="Example: A fox barista who remembers every order… and every secret." />
          </Field>
          <Field id="c-desc" label="Description" value={form.description} max={LIMITS.description} error={err('description')}>
            <textarea id="c-desc" className="cinput" rows={4} value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="Example: He runs the night shift at a café on the rainy edge of the city. Kinder than he lets on." />
          </Field>

          {form.greetings.map((g, i) => (
            <Field
              key={i}
              id={`c-greeting-${i}`}
              label={i === 0 ? 'Greeting' : `Greeting ${i + 1}`}
              value={g}
              max={LIMITS.greeting}
              error={i === 0 ? err('greeting') : ''}
              hint={i === 0 ? 'Use {{user}} for the person chatting and *asterisks* for actions.' : 'Swipeable alternate opening.'}
            >
              <div className="cgreeting">
                <textarea
                  id={`c-greeting-${i}`}
                  className={`cinput ${i === 0 && err('greeting') ? 'invalid' : ''}`}
                  rows={5}
                  value={g}
                  onChange={(e) => setGreeting(i, e.target.value)}
                  placeholder={i === 0 ? 'Example: *looks up from the counter* Took you long enough, {{user}}.' : ''}
                />
                {i > 0 && (
                  <button
                    type="button"
                    className="icon-btn sm cgreeting-remove"
                    onClick={() => set({ greetings: form.greetings.filter((_, j) => j !== i) })}
                    aria-label={`Remove greeting ${i + 1}`}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </Field>
          ))}
          {form.greetings.length < MAX_GREETINGS && (
            <button type="button" className="add-greeting" onClick={() => set({ greetings: [...form.greetings, ''] })}>
              <Plus size={18} /> Add a greeting ({form.greetings.length}/{MAX_GREETINGS})
            </button>
          )}

          <div className="field-grid">
            <div className="cfield">
              <label className="cfield-label" htmlFor="c-cat">
                Category
              </label>
              <select id="c-cat" className="cinput select" value={form.category} onChange={(e) => set({ category: e.target.value })}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="cfield">
              <label className="cfield-label" htmlFor="c-tags">
                Tags
              </label>
              <input id="c-tags" className="cinput" value={form.tags} onChange={(e) => set({ tags: e.target.value })} placeholder="Fox, Cozy, Slice of life" />
            </div>
          </div>

          <h2 className="creator-section">Definition</h2>
          <Field id="c-persona" label="Persona" value={form.persona} max={LIMITS.persona} error={err('persona')} hint="Hidden from the profile. Appearance, personality, voice, world, goals.">
            <textarea id="c-persona" className={`cinput ${err('persona') ? 'invalid' : ''}`} rows={9} value={form.persona} onChange={(e) => set({ persona: e.target.value })} placeholder="{{char}} is a…" />
          </Field>
          <Field id="c-mood" label="Default mood" value={form.mood} max={LIMITS.mood}>
            <input id="c-mood" className="cinput" value={form.mood} onChange={(e) => set({ mood: e.target.value })} placeholder="Teasing, warm, a little tired" />
          </Field>
          <Field id="c-examples" label="Example dialogue" value={form.examples} max={LIMITS.examples} hint="Lines start with {{user}}: or {{char}}:, exchanges separated by a blank line.">
            <textarea id="c-examples" className="cinput mono" rows={8} value={form.examples} onChange={(e) => set({ examples: e.target.value })} placeholder={'{{user}}: Hi!\n{{char}}: *waves a paw* Hey yourself.'} />
          </Field>
          <button
            type="button"
            className="add-greeting"
            onClick={() => set({ examples: `${form.examples.trim()}${form.examples.trim() ? '\n\n' : ''}{{user}}: \n{{char}}: ` })}
          >
            <Plus size={18} /> Add an example exchange
          </button>

          <h2 className="creator-section">Behavior</h2>
          <div className="cfield">
            <span className="cfield-label">Visibility</span>
            <div className="vis-options" role="radiogroup" aria-label="Visibility">
              {VISIBILITY.map((v) => (
                <button key={v.id} type="button" role="radio" aria-checked={form.visibility === v.id} className={`vis-option ${form.visibility === v.id ? 'active' : ''}`} onClick={() => set({ visibility: v.id })}>
                  <v.icon size={16} />
                  <span>
                    <strong>{v.label}</strong>
                    <span>{v.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="cfield">
            <label className="cfield-label" htmlFor="c-creativity">
              Creativity
            </label>
            <Range id="c-creativity" value={form.creativity} min={0} max={100} step={5} onChange={(v) => set({ creativity: v })} />
            <span className="field-hint">Low stays grounded and consistent; high adds surprises and new plot hooks.</span>
          </div>
          <div className="cfield">
            <label className="cfield-label" htmlFor="c-temp">
              Temperature
            </label>
            <Range id="c-temp" value={form.temperature} min={0} max={2} step={0.05} onChange={(v) => set({ temperature: v })} format={(v) => v.toFixed(2)} />
            <span className="field-hint">Randomness of the first draft on DeepSeek. Swipes and regenerations use 0.85–1.0.</span>
          </div>
          <div className="cfield">
            <label className="cfield-label" htmlFor="c-verb">
              Verbosity
            </label>
            <Range id="c-verb" value={form.verbosity} min={1} max={3} step={1} onChange={(v) => set({ verbosity: v })} format={(v) => VERBOSITY[v - 1]} />
          </div>

          <h2 className="creator-section">Credit</h2>
          <div className="field-grid">
            <div className="cfield">
              <label className="cfield-label" htmlFor="c-creator">
                Creator
              </label>
              <input id="c-creator" className="cinput" value={form.creator} onChange={(e) => set({ creator: e.target.value })} placeholder={persona.name} />
            </div>
            <div className="cfield">
              <label className="cfield-label" htmlFor="c-source">
                Source link
              </label>
              <input id="c-source" className="cinput" value={form.sourceUrl} onChange={(e) => set({ sourceUrl: e.target.value })} placeholder="Where the original lives (optional)" />
            </div>
          </div>
        </div>
      </div>

      <footer className="creator-foot">
        <div className="creator-foot-inner">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save}>
            {editing ? 'Save changes' : 'Create character'}
          </button>
        </div>
      </footer>
    </div>
  );
}
