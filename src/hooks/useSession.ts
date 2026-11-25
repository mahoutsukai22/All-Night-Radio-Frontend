import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabase } from '../lib/supabase';

export function useSession() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let live = true;
    let unsubscribe = () => {};

    getSupabase()
      .then((supabase) => {
        if (!live) return;
        // Fires immediately with the stored session, then on every sign in/out/refresh.
        const { data } = supabase.auth.onAuthStateChange((_event, session) =>
          setUser(session?.user ?? null),
        );
        unsubscribe = () => data.subscription.unsubscribe();
      })
      .catch((err) => console.error('Supabase unavailable', err));

    return () => {
      live = false;
      unsubscribe();
    };
  }, []);

  return user;
}
