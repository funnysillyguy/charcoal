import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from './components/Layout/Sidebar.jsx';
import Home from './pages/Home.jsx';
import ChatWindow from './components/Chat/ChatWindow.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import AccountModal from './components/AccountModal.jsx';
import OwnKeyGuide from './components/OwnKeyGuide.jsx';
import NotificationsPanel from './components/NotificationsPanel.jsx';
import CanvasPanel from './components/Canvas/CanvasPanel.jsx';
import LegalModal from './components/LegalModal.jsx';
import { useCanvas } from './lib/canvas.js';
import { assistantCharacter, isAssistantId, newAssistantId } from './lib/assistant.js';
import { registerActionHost } from './lib/actions.js';
import { useUpdateAvailable } from './lib/update.js';
import { useSocial } from './lib/social.js';
import { useCloudSync } from './lib/sync.js';
import CharacterCreator from './pages/CharacterCreator.jsx';
import CharacterProfileModal from './components/CharacterProfileModal.jsx';
import { RefuelOverlay } from './components/Fuel.jsx';
import { UIContext, useToasts, ToastStack } from './components/ui.jsx';
import { StoreProvider, useSettings, useStore } from './lib/store.jsx';

function Shell() {
  const { state, dispatch, getState } = useStore();
  const [view, setView] = useState({ name: 'home' });
  const [drawer, setDrawer] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [legal, setLegal] = useState(null); // 'terms' | 'privacy' | null
  const [notice, setNotice] = useState(null); // top banner: { id, text }
  useSocial();
  useCloudSync();
  const [creator, setCreator] = useState(null); // null | { character?, remix?, name? }
  const [profileId, setProfileId] = useState(null);
  const { toasts, push } = useToasts();

  const [collapsed, setCollapsed] = useState(false);
  const updateReady = useUpdateAvailable();
  const [updateHidden, setUpdateHidden] = useState(false);

  // The Canvas needs the room: fold the sidebar away while it's open on laptop-size screens,
  // and put it back the way it was when the Canvas closes.
  const canvasOpen = useCanvas().open;
  const beforeCanvas = useRef(null);
  useEffect(() => {
    if (canvasOpen) {
      if (beforeCanvas.current === null && window.matchMedia?.('(min-width: 901px) and (max-width: 1700px)').matches) {
        beforeCanvas.current = collapsed;
        setCollapsed(true);
      }
    } else if (beforeCanvas.current !== null) {
      setCollapsed(beforeCanvas.current);
      beforeCanvas.current = null;
    }
  }, [canvasOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const goHome = useCallback(() => {
    setView({ name: 'home' });
    setCreator(null);
    setDrawer(false);
  }, []);

  const openChat = useCallback(
    (character) => {
      dispatch({ type: 'chat/ensure', character });
      setView({ name: 'chat', id: character.id });
      setCreator(null);
      setDrawer(false);
      setProfileId(null);
    },
    [dispatch],
  );

  const ui = useMemo(
    () => ({
      goHome,
      openChat,
      // Charcoal Chat: open a thread, or start one (reusing an empty one so "Chat" never piles up blanks).
      openAssistant: (id) => {
        let target = id;
        if (!target) {
          const chats = getState().chats;
          target = Object.keys(chats).find((k) => isAssistantId(k) && !chats[k].messages.length) || newAssistantId();
        }
        dispatch({ type: 'chat/ensure', character: assistantCharacter(target) });
        setView({ name: 'chat', id: target });
        setCreator(null);
        setDrawer(false);
        setProfileId(null);
      },
      openProfile: (id) => {
        if (isAssistantId(id)) return;
        setProfileId(id);
        setDrawer(false);
      },
      openCreator: (init = {}) => {
        setCreator({ ...init, key: Date.now() });
        setProfileId(null);
        setDrawer(false);
      },
      openSettings: () => {
        setSettingsOpen(true);
        setDrawer(false);
      },
      openAccount: () => {
        setAccountOpen(true);
        setDrawer(false);
      },
      openGuide: () => {
        setGuideOpen(true);
        setDrawer(false);
      },
      openLegal: (page = 'terms') => {
        setLegal(page);
        setDrawer(false);
      },
      openNotifications: () => {
        setNotifOpen(true);
        setDrawer(false);
      },
      notice: (text) => {
        const id = Date.now();
        setNotice({ id, text });
        setTimeout(() => setNotice((n) => (n?.id === id ? null : n)), 3200);
      },
      // Phones: slide-in drawer. Desktop: re-open a collapsed sidebar.
      openDrawer: () => {
        if (window.matchMedia?.('(max-width: 900px)').matches) setDrawer(true);
        else setCollapsed(false);
      },
      toast: push,
    }),
    [goHome, openChat, push, dispatch, getState],
  );

  // Charcoal Chat's actions run through here (each one only after the user allows it).
  const { updateSettings } = useSettings();
  useEffect(() => registerActionHost({ dispatch, getState, updateSettings, ui }), [dispatch, getState, updateSettings, ui]);

  if (!state.hydrated) {
    return (
      <div className="boot">
        <span className="logo-mark" aria-hidden="true" />
      </div>
    );
  }

  return (
    <UIContext.Provider value={ui}>
      <div className={`app ${collapsed ? 'collapsed' : ''}`}>
        <Sidebar
          open={drawer}
          onClose={() => setDrawer(false)}
          onCollapse={() => {
            setDrawer(false);
            setCollapsed(true);
          }}
          activeId={view.name === 'chat' ? view.id : null}
          view={creator ? 'create' : view.name}
        />
        <main className="main">
          {creator ? (
            <CharacterCreator key={creator.key} init={creator} onClose={() => setCreator(null)} />
          ) : view.name === 'home' ? (
            <Home />
          ) : (
            <ChatWindow key={view.id} characterId={view.id} />
          )}
        </main>
        <CanvasPanel />
      </div>
      {profileId && <CharacterProfileModal characterId={profileId} onClose={() => setProfileId(null)} />}
      <RefuelOverlay />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={() => push('Settings saved', 'ok')} />
      <AccountModal open={accountOpen} onClose={() => setAccountOpen(false)} />
      <NotificationsPanel open={notifOpen} onClose={() => setNotifOpen(false)} onSignIn={() => { setNotifOpen(false); setAccountOpen(true); }} />
      {notice && (
        <div className="top-notice" key={notice.id} role="status">
          {notice.text}
        </div>
      )}
      <LegalModal page={legal} onChange={setLegal} onClose={() => setLegal(null)} />
      {updateReady && !updateHidden && (
        <div className="update-bar" role="status">
          <span>Charcoal was updated.</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>
            Refresh
          </button>
          <button type="button" className="update-later" onClick={() => setUpdateHidden(true)} aria-label="Later">
            Later
          </button>
        </div>
      )}
      <OwnKeyGuide open={guideOpen} onClose={() => setGuideOpen(false)} onOpenSettings={() => setSettingsOpen(true)} />
      <ToastStack toasts={toasts} />
    </UIContext.Provider>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
