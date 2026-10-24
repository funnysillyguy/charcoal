import { useMemo, useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { Modal } from '../ui.jsx';
import { fillNames } from '../../lib/format.js';
import { SANDBOXED } from '../../lib/settings.js';

const FORMATS = [
  ['md', 'Markdown'],
  ['txt', 'Plain text'],
  ['json', 'JSON'],
];

function build(format, chat, character, persona) {
  const names = { user: persona.name, char: character.name };
  const turns = chat.messages.map((m) => {
    if (m.role === 'user') {
      return { speaker: persona.name, text: fillNames(m.text, names), images: (m.images || []).map((i) => i.name) };
    }
    const v = m.variants[m.active] || m.variants[0];
    return {
      speaker: character.name,
      text: fillNames(v?.text || '', names),
      swipe: `${(m.active || 0) + 1}/${m.variants.length}`,
      model: v?.meta?.model,
      temperature: v?.meta?.temperature,
    };
  });

  if (format === 'json') {
    return JSON.stringify(
      {
        app: 'Charcoal',
        exportedAt: new Date().toISOString(),
        character: { id: character.id, name: character.name, creator: character.creator },
        persona: persona.name,
        mood: chat.mood || character.mood || null,
        messages: turns,
      },
      null,
      2,
    );
  }
  if (format === 'txt') {
    return turns
      .map((t) => `${t.speaker}:\n${t.text}${t.images?.length ? `\n[images: ${t.images.join(', ')}]` : ''}`)
      .join('\n\n');
  }
  const head = `# ${character.name} × ${persona.name}\n\n_Exported from Charcoal on ${new Date().toLocaleString()}. Character by @${character.creator}._\n`;
  const body = turns
    .map((t) => `**${t.speaker}**${t.images?.length ? ` _(sent ${t.images.length} image${t.images.length > 1 ? 's' : ''})_` : ''}\n\n${t.text}`)
    .join('\n\n---\n\n');
  return `${head}\n${body}\n`;
}

export default function ExportModal({ open, onClose, chat, character, persona }) {
  const [format, setFormat] = useState('md');
  const [copied, setCopied] = useState(false);
  const content = useMemo(
    () => (open && chat ? build(format, chat, character, persona) : ''),
    [open, format, chat, character, persona],
  );

  const copy = async (e) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const ta = e.currentTarget.closest('.modal')?.querySelector('textarea');
      ta?.select();
    }
  };

  const download = () => {
    const type = format === 'json' ? 'application/json' : format === 'md' ? 'text/markdown' : 'text/plain';
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `charcoal-${character.id}-${new Date().toISOString().slice(0, 10)}.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Export chat"
      subtitle={`${chat?.messages.length || 0} messages · the swipe you're viewing is exported for each turn`}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={copy}>
            {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy'}
          </button>
          {!SANDBOXED && (
            <button type="button" className="btn btn-primary" onClick={download}>
              <Download size={15} /> Download .{format}
            </button>
          )}
        </>
      }
    >
      <div className="segmented" role="radiogroup" aria-label="Format">
        {FORMATS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={format === id}
            className={format === id ? 'active' : ''}
            onClick={() => setFormat(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <textarea id="export-content" className="textarea mono export-text" readOnly value={content} rows={14} />
    </Modal>
  );
}
