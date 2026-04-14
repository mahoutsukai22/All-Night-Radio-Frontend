import { useState } from 'react';
import { Button, Stack, TextField, Typography } from '@mui/material';
import { supabase } from '../lib/supabase';

export default function Login({ onLogin }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      return;
    }

    const token = data.session?.access_token;

    localStorage.setItem('token', token!);
    onLogin(token); // 🔥 update app state
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h5">Login</Typography>

      <TextField
        label="Email"
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        type="email"
        value={email}
      />

      <TextField
        label="Password"
        onChange={(e) => setPassword(e.target.value)}
        type="password"
        value={password}
      />

      <Button className="primary-button" onClick={handleLogin} variant="contained">
        Login
      </Button>
    </Stack>
  );
}
