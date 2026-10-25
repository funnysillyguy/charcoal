import { useCallback, useMemo, useState } from 'react';
import Sidebar from './components/Layout/Sidebar.jsx';
import Home from './pages/Home.jsx';
import ChatWindow from './components/Chat/ChatWindow.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import AccountModal from './components/AccountModal.jsx';
import OwnKeyGuide from './components/OwnKeyGuide.jsx';
import { useCloudSync } from './lib/sync.js';
import CharacterCreator from './pages/CharacterCreator.jsx';
import CharacterProfileModal from './components/CharacterProfileModal.jsx';
import { RefuelOverlay } from './components/Fuel.jsx';
import { UIContext, useToasts, ToastStack } from './components/ui.jsx';
import { StoreProvider, useStore } from './lib/store.jsx';

function Shell() {
  const { state, dispatch } = useStore();
  const [view, setView] = useState({ name: 'home' });
  const [drawer, setDrawer] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  useCloudSync();
  const [creator, setCreator] = useState(null); // null | { character?, remix?, name? }
  const [profileId, setProfileId] = useState(null);
  const { toasts, push } = useToasts();

  const [collapsed, setCollapsed] = useState(false);

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
      openProfile: (id) => {
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
      // Phones: slide-in drawer. Desktop: re-open a collapsed sidebar.
      openDrawer: () => {
        if (window.matchMedia?.('(max-width: 900px)').matches) setDrawer(true);
        else setCollapsed(false);
      },
      toast: push,
    }),
    [goHome, openChat, push],
  );

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
      </div>
      {profileId && <CharacterProfileModal characterId={profileId} onClose={() => setProfileId(null)} />}
      <RefuelOverlay />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={() => push('Settings saved', 'ok')} />
      <AccountModal open={accountOpen} onClose={() => setAccountOpen(false)} />
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
