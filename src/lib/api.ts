import { getSupabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL;

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Calls the backend with the current (auto-refreshed) Supabase access token. */
export async function api<T>(
  path: string,
  { method = 'GET', body }: { method?: string; body?: unknown } = {},
): Promise<T> {
  const { data } = await (await getSupabase()).auth.getSession();
  const token = data.session?.access_token;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    const message = Array.isArray(error.message) ? error.message[0] : error.message;
    throw new ApiError(message || 'Request failed', res.status);
  }
  return res.json();
}
