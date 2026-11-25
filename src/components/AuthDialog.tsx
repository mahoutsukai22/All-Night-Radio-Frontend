import { useState, type FormEvent } from 'react';
import type { AuthMode, Tone } from '../context';
import { getSupabase } from '../lib/supabase';
import Modal from './Modal';

type Props = {
  mode: AuthMode | null;
  onMode: (mode: AuthMode | null) => void;
  notify: (text: string, tone?: Tone) => void;
};

export default function AuthDialog({ mode, onMode, notify }: Props) {
  const [message, setMessage] = useState<{ text: string; tone: Tone } | null>(null);
  const [pending, setPending] = useState(false);
  const login = mode === 'login';

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get('email')).trim();
    const password = String(form.get('password'));

    setPending(true);
    setMessage(null);
    try {
      const { auth } = await getSupabase();
      const { data, error } = login
        ? await auth.signInWithPassword({ email, password })
        : await auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });

      if (error) {
        setMessage({
          text: error.status === 429 ? 'Too many attempts. Wait a few minutes and try again.' : error.message,
          tone: 'error',
        });
      } else if (data.session) {
        notify(login ? 'Welcome back — your library is ready.' : 'Account created. Happy listening!', 'success');
        onMode(null);
      } else {
        setMessage({ text: 'Check your inbox to confirm your email, then sign in.', tone: 'success' });
        onMode('login');
      }
    } catch {
      setMessage({ text: 'Sign-in is unavailable right now.', tone: 'error' });
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      eyebrow="Save your favourite stations"
      onClose={() => {
        setMessage(null);
        onMode(null);
      }}
      open={!!mode}
      title={login ? 'Welcome back' : 'Create your listening account'}
    >
      <p className="muted">Listening is free for everyone. An account adds folders and a personal library.</p>
      <form className="form" onSubmit={submit}>
        <label>
          Email
          <input autoComplete="email" name="email" placeholder="you@example.com" required type="email" />
        </label>
        <label>
          Password
          <input
            autoComplete={login ? 'current-password' : 'new-password'}
            minLength={6}
            name="password"
            placeholder={login ? '' : 'At least 6 characters'}
            required
            type="password"
          />
        </label>
        {message && <p className={`form-msg ${message.tone}`}>{message.text}</p>}
        <button className="btn" disabled={pending} type="submit">
          {pending ? 'Working…' : login ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <p className="muted switch">
        {login ? 'New here?' : 'Already have an account?'}{' '}
        <button className="link" onClick={() => onMode(login ? 'signup' : 'login')} type="button">
          {login ? 'Create an account' : 'Sign in instead'}
        </button>
      </p>
    </Modal>
  );
}
