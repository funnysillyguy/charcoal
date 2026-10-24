// Shared UI context (navigation + modals + toasts) and small primitives.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

export const UIContext = createContext(null);
export const useUI = () => useContext(UIContext);

/* ---------- Toasts ---------- */
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, tone = 'neutral') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-2), { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return { toasts, push };
}

export function ToastStack({ toasts }) {
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

/* ---------- Modal ---------- */
export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md', labelledBy }) {
  const panelRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => {
      const el = panelRef.current?.querySelector('[data-autofocus]') || panelRef.current;
      el?.focus({ preventScroll: true });
    }, 30);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div
        className={`modal modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy || 'modal-title'}
        ref={panelRef}
        tabIndex={-1}
      >
        {title !== undefined && (
          <header className="modal-head">
            <div>
              <h2 id="modal-title">{title}</h2>
              {subtitle && <p className="modal-sub">{subtitle}</p>}
            </div>
            {onClose && (
              <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
                <X size={18} />
              </button>
            )}
          </header>
        )}
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

/* ---------- Confirm (window.confirm isn't available everywhere) ---------- */
export function ConfirmDialog({ open, title, body, confirmLabel = 'Confirm', tone = 'danger', onConfirm, onClose }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} data-autofocus>
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => {
              onConfirm?.();
              onClose?.();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="confirm-body">{body}</p>
    </Modal>
  );
}

/* ---------- Popover (click-outside to close) ---------- */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return { open, setOpen, ref, toggle: () => setOpen((o) => !o) };
}

/* ---------- Empty state ---------- */
export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="empty">
      {Icon && (
        <span className="empty-icon">
          <Icon size={22} />
        </span>
      )}
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action}
    </div>
  );
}
