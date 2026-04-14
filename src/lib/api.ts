const API_URL = import.meta.env.VITE_API_URL;

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiFetch(path: string, options: any = {}) {
  const token = localStorage.getItem('token');

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  // handle errors safely
  if (!res.ok) {
    let error;
    try {
      error = await res.json();
    } catch {
      error = { message: 'Unknown error' };
    }

    throw new ApiError(error.message || 'Request failed', res.status);
  }

  return res.json();
}
