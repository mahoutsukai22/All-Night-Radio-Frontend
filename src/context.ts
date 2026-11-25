import { createContext, useContext } from 'react';
import type { User } from '@supabase/supabase-js';
import type { Library } from './hooks/useLibrary';
import type { usePlayer } from './hooks/usePlayer';
import type { RadioStation } from './lib/radio';

export type Tone = 'info' | 'success' | 'error';
export type AuthMode = 'login' | 'signup';

export type AppContextValue = {
  user: User | null;
  player: ReturnType<typeof usePlayer>;
  library: Library;
  notify: (text: string, tone?: Tone) => void;
  requireAuth: (mode: AuthMode) => void;
  requestSave: (station: RadioStation) => void;
};

export const AppContext = createContext<AppContextValue | null>(null);

export const useApp = () => {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside <AppContext.Provider>');
  return value;
};
