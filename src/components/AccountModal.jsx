import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  CloudOff,
  Copy,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Loader,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from './icons.jsx';
import { Modal, ConfirmDialog, useUI } from './ui.jsx';
import { useSettings, useStore } from '../lib/store.jsx';
import {
  CLOUD_ENABLED,
  USERNAME_HELP,
  USERNAME_RE,
  deleteAccount,
  normUser,
  regenCodes,
  resetPassword,
  signIn,
  signOut,
  signUp,
  useSession,
} from '../lib/cloud.js';
import { requestSync, useSyncStatus } from '../lib/sync.js';
import '../styles/account.css';

function ago(ts) {
  if (!ts) return '';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : new Date(ts).toLocaleDateString();
}

function PasswordInput({ id, value, onChange, placeholder, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div className="input-group">
      <input
        id={id}
        className="input"
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        spellCheck={false}
      />
      <button type="button" className="icon-btn" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

/** Shown once after signup / regenerating. */
function CodesPanel({ username, codes, onDone, doneLabel = 'Continue' }) {
  const ui = useUI();
  const [saved, setSaved] = useState(false);
  const text = `Charcoal recovery codes for @${username}\nEach code works once. Keep these somewhere safe.\n\n${codes.join('\n')}\n`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      ui.toast('Codes copied', 'ok');
    } catch {
      ui.toast('Couldn’t copy. Select them and copy by hand.', 'error');
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `charcoal-recovery-${username}.txt` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="codes-panel">
      <div className="codes-head">
        <ShieldCheck size={18} />
        <div>
          <strong>Save your recovery codes</strong>
          <p>
            If you forget your password, one of these gets you back in. Each works once. There’s no email reset, so if you lose
            the password <em>and</em> these, the account is gone for good.
          </p>
        </div>
      </div>
      <ol className="codes-grid">
        {codes.map((c) => (
          <li key={c}>
            <code>{c}</code>
          </li>
        ))}
      </ol>
      <div className="codes-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>
          <Copy size={14} /> Copy all
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={download}>
          <Download size={14} /> Download .txt
        </button>
      </div>
      <p className="field-hint">Writing them on paper and snapping a photo works too.</p>
      <label className="check-label">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />I saved these somewhere I won’t lose
      </label>
      <button type="button" className="btn btn-primary btn-block" disabled={!saved} onClick={onDone}>
        {doneLabel}
      </button>
    </div>
  );
}

function SignedOut({ onCodes }) {
  const { settings, updateSettings } = useSettings();
  const ui = useUI();
  const [tab, setTab] = useState('in');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setError(''), [tab]);
  const u = normUser(username);
  const userBad = username && !USERNAME_RE.test(u);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    if (!USERNAME_RE.test(u)) return setError(USERNAME_HELP);
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (tab === 'up' && password !== confirm) return setError('Passwords don’t match.');
    if (tab === 'reset' && !code.trim()) return setError('Enter one of your recovery codes.');
    setBusy(true);
    try {
      if (tab === 'in') {
        const { remoteKey } = await signIn(u, password);
        if (remoteKey && !(settings.apiKey || '').trim()) updateSettings({ apiKey: remoteKey, lastCheck: null });
        ui.toast(`Signed in as @${u}`, 'ok');
      } else if (tab === 'up') {
        const { codes } = await signUp(u, password);
        onCodes({ username: u, codes, fresh: true });
      } else {
        const { codesLeft } = await resetPassword(u, code, password);
        ui.toast(`Password changed. ${codesLeft} recovery code${codesLeft === 1 ? '' : 's'} left.`, 'ok');
      }
    } catch (err) {
      setError(err?.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="account-form" onSubmit={submit}>
      {tab !== 'reset' ? (
        <div className="segmented account-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'in'} className={tab === 'in' ? 'active' : ''} onClick={() => setTab('in')}>
            Sign in
          </button>
          <button type="button" role="tab" aria-selected={tab === 'up'} className={tab === 'up' ? 'active' : ''} onClick={() => setTab('up')}>
            Create account
          </button>
        </div>
      ) : (
        <div className="account-reset-head">
          <KeyRound size={16} />
          <span>Reset with a recovery code</span>
        </div>
      )}

      <div className="field">
        <label className="field-label" htmlFor="acct-user">
          Username
        </label>
        <div className="input-prefix">
          <span>@</span>
          <input
            id="acct-user"
            className={`input ${userBad ? 'invalid' : ''}`}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            data-autofocus
            maxLength={25}
          />
        </div>
        {userBad && <p className="field-hint">{USERNAME_HELP}</p>}
      </div>

      {tab === 'reset' && (
        <div className="field">
          <label className="field-label" htmlFor="acct-code">
            Recovery code
          </label>
          <input
            id="acct-code"
            className="input mono"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
          />
        </div>
      )}

      <div className="field">
        <label className="field-label" htmlFor="acct-pass">
          {tab === 'reset' ? 'New password' : 'Password'}
        </label>
        <PasswordInput
          id="acct-pass"
          value={password}
          onChange={setPassword}
          autoComplete={tab === 'in' ? 'current-password' : 'new-password'}
          placeholder={tab === 'in' ? '' : 'At least 8 characters'}
        />
      </div>

      {tab === 'up' && (
        <div className="field">
          <label className="field-label" htmlFor="acct-pass2">
            Confirm password
          </label>
          <PasswordInput id="acct-pass2" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        </div>
      )}

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
        {busy && <Loader size={15} className="spin" />}
        {tab === 'in' ? 'Sign in' : tab === 'up' ? 'Create account' : 'Change password'}
      </button>
      {tab === 'up' && (
        <p className="legal-note">
          By creating an account you agree to the{' '}
          <button type="button" onClick={() => ui.openLegal('terms')}>
            Terms
          </button>{' '}
          and{' '}
          <button type="button" onClick={() => ui.openLegal('privacy')}>
            Privacy Policy
          </button>
          .
        </p>
      )}

      <div className="account-links">
        {tab === 'reset' ? (
          <button type="button" className="link-btn" onClick={() => setTab('in')}>
            Back to sign in
          </button>
        ) : (
          <button type="button" className="link-btn" onClick={() => setTab('reset')}>
            Forgot password?
          </button>
        )}
      </div>

      <p className="account-fine">
        No email needed. Your DeepSeek key gets encrypted in your browser with your password before it’s saved, so the server
        only ever sees scrambled text. Characters and personas sync. Chats stay on each device.
        {tab === 'reset' && ' Resetting with a code clears the saved key, so you’ll paste it in again once.'}
      </p>
    </form>
  );
}

function SignedIn({ session, onCodes, onClose }) {
  const ui = useUI();
  const { dispatch } = useStore();
  const { updateSettings } = useSettings();
  const sync = useSyncStatus();
  const [wipe, setWipe] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [busy, setBusy] = useState('');
  const [, tick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15000);
    return () => clearInterval(t);
  }, []);

  const wipeLocal = () => {
    dispatch({ type: 'local/wipe' });
    updateSettings({ apiKey: '', lastCheck: null });
  };

  const doSignOut = async () => {
    setBusy('out');
    await signOut();
    if (wipe) wipeLocal();
    setBusy('');
    ui.toast(wipe ? 'Signed out and cleared this device' : 'Signed out', 'ok');
    onClose();
  };

  const doRegen = async () => {
    setBusy('regen');
    try {
      const codes = await regenCodes();
      onCodes({ username: session.username, codes, fresh: false });
    } catch (e) {
      ui.toast(e?.message || 'Couldn’t make new codes', 'error');
    } finally {
      setBusy('');
    }
  };

  const doDelete = async () => {
    setBusy('del');
    try {
      await deleteAccount();
      ui.toast('Account deleted. Your copies on this device are still here.', 'ok');
      onClose();
    } catch (e) {
      ui.toast(e?.message || 'Couldn’t delete the account', 'error');
    } finally {
      setBusy('');
    }
  };

  const syncLabel =
    sync.phase === 'syncing'
      ? 'Syncing…'
      : sync.phase === 'ok'
        ? `Synced ${ago(sync.at)}`
        : sync.phase === 'offline'
          ? 'Offline. Will sync when you’re back.'
          : sync.phase === 'error'
            ? sync.error
            : 'Waiting to sync';
  const dot = sync.phase === 'ok' ? 'live' : sync.phase === 'syncing' || sync.phase === 'idle' ? 'unverified' : 'error';

  return (
    <div className="account-in">
      <div className="account-card">
        <span className="account-avatar" aria-hidden="true">
          {session.username.slice(0, 1).toUpperCase()}
        </span>
        <div className="account-who">
          <strong>@{session.username}</strong>
          <span className="account-sync">
            <span className={`status-dot ${dot}`} />
            {syncLabel}
          </span>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={requestSync} disabled={sync.phase === 'syncing'}>
          <RefreshCw size={14} className={sync.phase === 'syncing' ? 'spin' : ''} /> Sync now
        </button>
      </div>
      {sync.skipped > 0 && (
        <p className="field-hint">
          {sync.skipped} item{sync.skipped === 1 ? ' is' : 's are'} too big to sync (usually a huge avatar). Swap in a smaller image.
        </p>
      )}

      <ul className="account-perks">
        <li>Characters and personas sync across your devices.</li>
        <li>Your DeepSeek key is stored encrypted. Only your password can unlock it.</li>
        <li>Chats stay on this device.</li>
      </ul>

      <div className="account-row">
        <div>
          <span className="field-label">Recovery codes</span>
          <p className="field-hint">Lost them or used a few? Make a fresh set. The old ones stop working.</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmRegen(true)} disabled={!!busy}>
          {busy === 'regen' ? <Loader size={14} className="spin" /> : <KeyRound size={14} />} New codes
        </button>
      </div>

      <div className="account-row">
        <div>
          <span className="field-label">Sign out</span>
          <label className="check-label">
            <input type="checkbox" checked={wipe} onChange={(e) => setWipe(e.target.checked)} />
            Also clear characters, chats and the API key from this device
          </label>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => (wipe ? setConfirmOut(true) : doSignOut())} disabled={!!busy}>
          {busy === 'out' ? <Loader size={14} className="spin" /> : <LogOut size={14} />} Sign out
        </button>
      </div>

      <div className="account-row danger">
        <div>
          <span className="field-label">Delete account</span>
          <p className="field-hint">Removes your cloud copy and the saved key for good.</p>
        </div>
        <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmDel(true)} disabled={!!busy}>
          {busy === 'del' ? <Loader size={14} className="spin" /> : <Trash2 size={14} />} Delete
        </button>
      </div>

      <ConfirmDialog
        open={confirmRegen}
        title="Make new recovery codes?"
        body="Your current codes stop working right away."
        confirmLabel="Make new codes"
        tone="primary"
        onConfirm={() => {
          setConfirmRegen(false);
          doRegen();
        }}
        onClose={() => setConfirmRegen(false)}
      />
      <ConfirmDialog
        open={confirmOut}
        title="Sign out and clear this device?"
        body="Characters and personas are safe in your account. Chats on this device are deleted and can’t be recovered."
        confirmLabel="Sign out and clear"
        onConfirm={() => {
          setConfirmOut(false);
          doSignOut();
        }}
        onClose={() => setConfirmOut(false)}
      />
      <ConfirmDialog
        open={confirmDel}
        title={`Delete @${session.username}?`}
        body="Your synced characters, personas and saved key are deleted from the cloud. This can’t be undone."
        confirmLabel="Delete account"
        onConfirm={() => {
          setConfirmDel(false);
          doDelete();
        }}
        onClose={() => setConfirmDel(false)}
      />
    </div>
  );
}

export default function AccountModal({ open, onClose }) {
  const session = useSession();
  const [codes, setCodes] = useState(null); // { username, codes, fresh }

  useEffect(() => {
    if (!open) setCodes(null);
  }, [open]);

  const title = codes ? 'Recovery codes' : session ? 'Account' : 'Charcoal account';
  const subtitle = codes ? null : session ? null : 'Keep your characters and key across devices.';

  return (
    <Modal open={open} onClose={codes ? undefined : onClose} title={title} subtitle={subtitle} size={codes ? 'md' : 'sm'}>
      {!CLOUD_ENABLED ? (
        <div className="notice">
          <Cloud size={16} />
          <span>Accounts work on the full site (GitHub Pages or the standalone file), not inside this preview.</span>
        </div>
      ) : codes ? (
        <CodesPanel
          username={codes.username}
          codes={codes.codes}
          doneLabel={codes.fresh ? 'Start using Charcoal' : 'Done'}
          onDone={() => {
            setCodes(null);
            if (codes.fresh) onClose();
          }}
        />
      ) : session ? (
        <SignedIn session={session} onCodes={setCodes} onClose={onClose} />
      ) : (
        <SignedOut onCodes={setCodes} />
      )}
    </Modal>
  );
}
