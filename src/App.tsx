import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Ambience from './components/Ambience';
import AuthDialog from './components/AuthDialog';
import Icon from './components/Icon';
import PlayerBar from './components/PlayerBar';
import SaveDialog from './components/SaveDialog';
import ThemePicker from './components/ThemePicker';
import { AppContext, type AuthMode, type Tone } from './context';
import { useLibrary } from './hooks/useLibrary';
import { usePlayer } from './hooks/usePlayer';
import { useSession } from './hooks/useSession';
import type { RadioStation } from './lib/radio';
import { getSupabase } from './lib/supabase';
import { SEASONS, useTheme } from './lib/themes';
import Explore from './pages/Explore';

const Library = lazy(() => import('./pages/Library'));

export default function App() {
  const theme = useTheme();
  const user = useSession();
  const player = usePlayer();
  const library = useLibrary(user?.id);
  const [page, setPage] = useState<'map' | 'library'>('map');
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [saving, setSaving] = useState<RadioStation | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string; tone: Tone } | null>(null);
  const season = SEASONS.find((s) => s.id === theme.season)!;
  const showLibrary = page === 'library' && !!user;

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(timer);
  }, [toast]);

  const notify = useCallback((text: string, tone: Tone = 'info') => setToast({ id: Date.now(), text, tone }), []);
  const requestSave = useCallback((s: RadioStation) => (user ? setSaving(s) : setAuthMode('signup')), [user]);

  const signOut = async () => {
    await (await getSupabase()).auth.signOut();
    setPage('map');
    notify('Signed out. The radio keeps playing.');
  };

  const context = useMemo(
    () => ({ user, player, library, notify, requestSave, requireAuth: setAuthMode }),
    [user, player, library, notify, requestSave],
  );

  return (
    <AppContext.Provider value={context}>
      <div className="app" data-page={showLibrary ? 'library' : 'map'}>
        <Explore season={theme.season} />
        <Ambience enabled={theme.fx} season={theme.season} />

        <header className="topbar">
          <div className="brand" title={season.mood}>
            <span aria-hidden="true" className="brand-mark">
              {season.kanji}
            </span>
            <div>
              <strong>Radio Sekai</strong>
              <small>
                {season.label} · {season.mood}
              </small>
            </div>
          </div>

          <nav aria-label="Pages" className="seg pages">
            <button aria-pressed={!showLibrary} onClick={() => setPage('map')} type="button">
              <Icon name="globe" size={16} />
              <span>Globe</span>
            </button>
            <button
              aria-pressed={showLibrary}
              onClick={() => (user ? setPage('library') : setAuthMode('login'))}
              type="button"
            >
              <Icon name="folder" size={16} />
              <span>Library</span>
            </button>
          </nav>

          <ThemePicker
            choice={theme.choice}
            fx={theme.fx}
            onChoose={theme.setChoice}
            onToggleFx={() => theme.setFx(!theme.fx)}
          />

          {user ? (
            <button className="btn ghost account" onClick={() => void signOut()} title={user.email} type="button">
              <Icon name="logout" />
              <span>Sign out</span>
            </button>
          ) : (
            <button className="btn account" onClick={() => setAuthMode('login')} type="button">
              <Icon name="user" />
              <span>Sign in</span>
            </button>
          )}
        </header>

        {showLibrary && (
          <Suspense fallback={null}>
            <Library />
          </Suspense>
        )}

        <PlayerBar />

        {toast && (
          <div className={`toast ${toast.tone}`} key={toast.id} role="status">
            {toast.text}
          </div>
        )}
      </div>

      <AuthDialog mode={authMode} notify={notify} onMode={setAuthMode} />
      <SaveDialog onClose={() => setSaving(null)} station={saving} />
    </AppContext.Provider>
  );
}
