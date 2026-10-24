import { useState } from 'react';
import { Check, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { usePopover } from '../ui.jsx';
import { useStore, useActivePersona } from '../../lib/store.jsx';
import { uid } from '../../lib/images.js';

/** Who you're chatting as. The name fills {{user}}; the bio is sent to the model. */
export default function PersonaPicker({ variant = 'button' }) {
  const { state, dispatch } = useStore();
  const active = useActivePersona();
  const pop = usePopover();
  const [editing, setEditing] = useState(null);

  const startEdit = (p) => setEditing({ ...p });
  const save = () => {
    const name = editing.name.trim().slice(0, 32);
    if (!name) return;
    dispatch({ type: 'persona/save', persona: { ...editing, name, bio: editing.bio.slice(0, 600) }, select: true });
    setEditing(null);
  };

  return (
    <div className={`persona-picker ${variant}`} ref={pop.ref}>
      {variant === 'row' ? (
        <button
          type="button"
          className="persona-row-btn"
          onClick={() => {
            pop.toggle();
            setEditing(null);
          }}
          aria-expanded={pop.open}
          aria-label={`Persona: ${active.name}. Change persona`}
        >
          <span className="persona-avatar">{active.name.slice(0, 1).toUpperCase()}</span>
          <span className="persona-row-name">{active.name}</span>
          <ChevronDown size={18} />
        </button>
      ) : (
        <button
          type="button"
          className="persona-btn"
          onClick={() => {
            pop.toggle();
            setEditing(null);
          }}
          aria-expanded={pop.open}
          aria-label={`Persona: ${active.name}. Change persona`}
          title={`Chatting as ${active.name}`}
        >
          {active.name.slice(0, 1).toUpperCase()}
        </button>
      )}

      {pop.open && (
        <div className="popover persona-pop" role="dialog" aria-label="Choose persona">
          {editing ? (
            <div className="persona-edit">
              <div className="field">
                <label className="field-label" htmlFor="persona-name">
                  Name
                </label>
                <input
                  id="persona-name"
                  className="input"
                  value={editing.name}
                  maxLength={32}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  autoFocus
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="persona-bio">
                  About you <span className="count">{editing.bio.length}/600</span>
                </label>
                <textarea
                  id="persona-bio"
                  className="textarea"
                  rows={3}
                  value={editing.bio}
                  maxLength={600}
                  placeholder="What characters should know about you: appearance, role in the story, vibe."
                  onChange={(e) => setEditing({ ...editing, bio: e.target.value })}
                />
              </div>
              <div className="persona-edit-actions">
                {state.personas.length > 1 && state.personas.some((p) => p.id === editing.id) && (
                  <button
                    type="button"
                    className="icon-btn sm"
                    aria-label="Delete persona"
                    onClick={() => {
                      dispatch({ type: 'persona/delete', id: editing.id });
                      setEditing(null);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                <span style={{ flex: 1 }} />
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={!editing.name.trim()}>
                  Save
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="eyebrow pop-title">Chatting as</div>
              <ul className="persona-list">
                {state.personas.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={`persona-item ${p.id === active.id ? 'active' : ''}`}
                      onClick={() => {
                        dispatch({ type: 'persona/select', id: p.id });
                        pop.setOpen(false);
                      }}
                    >
                      <span className="persona-dot">{p.name.slice(0, 1).toUpperCase()}</span>
                      <span className="persona-item-text">
                        <span>{p.name}</span>
                        <span className="persona-item-bio">{p.bio || 'No bio'}</span>
                      </span>
                      {p.id === active.id && <Check size={14} />}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="persona-foot">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(active)}>
                  Edit {active.name}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setEditing({ id: uid('persona'), name: '', bio: '' })}
                >
                  <Plus size={13} /> New
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
