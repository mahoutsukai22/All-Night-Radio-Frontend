import { type FormEvent, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import { supabase } from '../lib/supabase';

export type AuthMode = 'login' | 'signup';

type AuthModalProps = {
  initialMode: AuthMode;
  isOpen: boolean;
  onAlert: (
    message: string,
    tone?: 'info' | 'success' | 'error'
  ) => void;
  onClose: () => void;
  onSuccess: (token: string | null) => void;
};

export default function AuthModal({
  initialMode,
  isOpen,
  onAlert,
  onClose,
  onSuccess,
}: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setMode(initialMode);
    setEmail('');
    setPassword('');
    setError('');
    setMessage('');
    setPending(false);
  }, [initialMode, isOpen]);

  if (!isOpen) {
    return null;
  }

  const emailRedirectTo = window.location.origin;

  const getAuthErrorMessage = (error: any, currentMode: AuthMode) => {
    if (error?.status === 429) {
      return currentMode === 'signup'
        ? 'Too many signup attempts right now. Wait a few minutes, then try again.'
        : 'Too many sign-in attempts right now. Wait a few minutes, then try again.';
    }

    return error?.message || 'Authentication failed.';
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (pending) {
      return;
    }

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      setError('');
      setMessage('');
      onAlert('Email and password are required.', 'error');
      return;
    }

    if (trimmedPassword.length < 6) {
      setError('');
      setMessage('');
      onAlert('Password must be at least 6 characters.', 'error');
      return;
    }

    setPending(true);
    setError('');
    setMessage('');

    try {
      if (mode === 'login') {
        const { data, error: loginError } =
          await supabase.auth.signInWithPassword({
            email: trimmedEmail,
            password: trimmedPassword,
          });

        if (loginError) {
          setError(getAuthErrorMessage(loginError, 'login'));
          return;
        }

        const token = data.session?.access_token ?? null;

        if (token) {
          localStorage.setItem('token', token);
        }

        onSuccess(token);
        onClose();
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: trimmedPassword,
        options: {
          emailRedirectTo,
        },
      });

      if (signUpError) {
        setError(getAuthErrorMessage(signUpError, 'signup'));
        return;
      }

      const token = data.session?.access_token ?? null;

      if (token) {
        localStorage.setItem('token', token);
        onSuccess(token);
        onClose();
        return;
      }

      setMessage(
        'Account created. Check your email to confirm, and you will be redirected back here.'
      );
      setMode('login');
      setPassword('');
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      fullWidth
      maxWidth="sm"
      onClose={onClose}
      open={isOpen}
      slotProps={{
        paper: {
          className: 'auth-modal',
          sx: {
            overflow: 'hidden',
            p: { xs: 0.5, sm: 1 },
          },
        },
        backdrop: {
          className: 'auth-modal-overlay',
        },
      }}
    >
      <DialogActions sx={{ justifyContent: 'flex-end', px: 3, pb: 0 }}>
        <Button
          className="ghost-button auth-close-button"
          onClick={onClose}
          type="button"
        >
          Close
        </Button>
      </DialogActions>

      <DialogTitle id="auth-modal-title" sx={{ px: 3, pt: 1, pb: 1 }}>
        <Typography className="eyebrow" component="p">
          Save your favorite stations
        </Typography>
        <Typography component="h2" sx={{ fontSize: 'clamp(1.5rem, 2vw, 2rem)', mt: 1 }}>
          {mode === 'login'
            ? 'Welcome back to All Night Radio'
            : 'Create your listening account'}
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ px: 3, pb: 3 }}>
        <Typography className="auth-copy" sx={{ mb: 2.5 }}>
          Browse and listen freely. Sign in only when you want folders,
          favorites, and a personal station library.
        </Typography>

        <Box
          className="auth-form"
          component="form"
          noValidate
          onSubmit={handleSubmit}
          sx={{ display: 'grid', gap: 1.75 }}
        >
          <TextField
            autoComplete="email"
            error={Boolean(error) && !email}
            label="Email"
            onChange={(event) => {
              setEmail(event.target.value);
              if (error) {
                setError('');
              }
              if (message) {
                setMessage('');
              }
            }}
            placeholder="you@example.com"
            type="email"
            value={email}
          />

          <TextField
            autoComplete={
              mode === 'login' ? 'current-password' : 'new-password'
            }
            error={Boolean(error) && !password}
            helperText={mode === 'signup' ? 'At least 6 characters' : ' '}
            label="Password"
            onChange={(event) => {
              setPassword(event.target.value);
              if (error) {
                setError('');
              }
              if (message) {
                setMessage('');
              }
            }}
            type="password"
            value={password}
          />

          {error && <Typography className="form-error">{error}</Typography>}
          {message && <Typography className="form-message">{message}</Typography>}

          <Button
            className="primary-button auth-submit"
            disabled={pending}
            type="submit"
            variant="contained"
          >
            {pending
              ? 'Working...'
              : mode === 'login'
                ? 'Sign in'
                : 'Create account'}
          </Button>

          <Box
            className="auth-footer"
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              alignItems: { xs: 'stretch', sm: 'center' },
              justifyContent: 'space-between',
              gap: 1.5,
            }}
          >
            <Typography component="span">
              {mode === 'login' ? 'New here?' : 'Already have an account?'}
            </Typography>
            <Button
              className="ghost-button"
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setError('');
                setMessage('');
              }}
              type="button"
              variant="outlined"
            >
              {mode === 'login' ? 'Create account' : 'Sign in instead'}
            </Button>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
