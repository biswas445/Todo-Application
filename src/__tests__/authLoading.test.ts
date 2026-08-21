import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAppStore } from '@/store/useAppStore';

// Regression tests for the auth-loading/init flow:
// - the app must never get stuck in the loading state,
// - a stale/invalid token must be cleared so the auth screen appears,
// - sign-in can be retried after a failure,
// - init makes exactly one /user/me/ round-trip (duplicate getMe regression),
// - transient server errors are retried instead of signing the user out.

// Mock localStorage
const mockLocalStorage = {
  data: {} as Record<string, string>,
  getItem: vi.fn((key: string) => mockLocalStorage.data[key] || null),
  setItem: vi.fn((key: string, value: string) => { mockLocalStorage.data[key] = value; }),
  removeItem: vi.fn((key: string) => { delete mockLocalStorage.data[key]; }),
  clear: vi.fn(() => { mockLocalStorage.data = {}; }),
};

beforeEach(() => {
  vi.stubGlobal('localStorage', mockLocalStorage);
  mockLocalStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

interface MockUser {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  bio: string;
  timezone: string;
  date_format: string;
  start_of_week: string;
  time_format: string;
  push_notifications: boolean;
  task_reminders: boolean;
}

function makeUser(): MockUser {
  return {
    id: 'u1',
    username: 'tester@example.com',
    email: 'tester@example.com',
    first_name: 'Test',
    last_name: 'User',
    bio: '',
    timezone: 'Asia/Kolkata',
    date_format: 'DD-MM-YY',
    start_of_week: 'Monday',
    time_format: '12-hour',
    push_notifications: true,
    task_reminders: true,
  };
}

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    json: async () => data,
  };
}

const COLLECTION_PATHS = ['/lists/', '/tags/', '/tasks/', '/notes/', '/events/', '/notifications/'];

// Routes every request the store makes during init/sign-in against in-memory
// behavior so tests can assert call counts and outcomes.
function mockApi(options: {
  user?: MockUser;
  authStatus?: number;
  meFailFirstWith500?: boolean;
  loginFailFirst?: boolean;
} = {}) {
  const { user = makeUser(), authStatus = 200, meFailFirstWith500 = false, loginFailFirst = false } = options;
  const counts = { me: 0, login: 0 };

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname.replace(/^\/api/, '');
    const method = init?.method ?? 'GET';

    if (method === 'GET' && path === '/user/me/') {
      counts.me += 1;
      if (authStatus !== 200) return jsonResponse({ detail: 'Invalid token.' }, authStatus);
      if (meFailFirstWith500 && counts.me === 1) return jsonResponse({ error: 'Server error' }, 500);
      return jsonResponse(user);
    }

    if (method === 'POST' && path === '/auth/login/') {
      counts.login += 1;
      if (loginFailFirst && counts.login === 1) {
        return jsonResponse({ error: 'Invalid email or password.' }, 401);
      }
      return jsonResponse({ token: 'fresh-token', user });
    }

    if (method === 'GET' && COLLECTION_PATHS.includes(path)) {
      if (authStatus !== 200) return jsonResponse({ detail: 'Invalid token.' }, authStatus);
      return jsonResponse([]);
    }

    throw new Error(`Unhandled test request: ${method} ${path}`);
  });

  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, counts };
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

describe('auth loading on startup', () => {
  it('stays signed out without calling the API when no token is saved', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAppStore());
    await flush();

    expect(result.current.loading).toBe(false);
    expect(result.current.data.session).toBe(false);
    expect(result.current.data.user).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the loading state while the saved session is being restored', async () => {
    mockLocalStorage.setItem('auth_token', 'saved-token');
    const user = makeUser();

    // Gate every response so the loading state can be observed deterministically.
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname.replace(/^\/api/, '');
      await gate;
      if (path === '/user/me/') return jsonResponse(user);
      return jsonResponse([]);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAppStore());

    // Init has started (token found, requests in flight) but not finished.
    expect(result.current.loading).toBe(true);
    expect(result.current.data.session).toBe(false);

    await act(async () => {
      release();
    });

    await waitFor(() => expect(result.current.data.session).toBe(true));
    expect(result.current.loading).toBe(false);
  });

  it('restores the session with exactly one /user/me/ call', async () => {
    mockLocalStorage.setItem('auth_token', 'saved-token');
    const user = makeUser();
    const { counts } = mockApi({ user });

    const { result } = renderHook(() => useAppStore());
    await waitFor(() => expect(result.current.data.session).toBe(true));

    expect(result.current.loading).toBe(false);
    expect(counts.me).toBe(1);
    // Settings come from the single user fetch, not a second round-trip.
    expect(result.current.data.settings.email).toBe(user.email);
    expect(result.current.data.settings.timezone).toBe(user.timezone);
  });

  it('clears the saved token and surfaces the error when it has expired', async () => {
    mockLocalStorage.setItem('auth_token', 'expired-token');
    mockApi({ authStatus: 401 });

    const { result } = renderHook(() => useAppStore());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data.session).toBe(false);
    expect(result.current.error).toBeTruthy();
    expect(mockLocalStorage.getItem('auth_token')).toBeNull();
  });
});

describe('sign-in retry behavior', () => {
  it('keeps loading false after a failed sign-in and succeeds on retry', async () => {
    const { counts } = mockApi({ loginFailFirst: true });

    const { result } = renderHook(() => useAppStore());
    await flush();
    expect(result.current.data.session).toBe(false);

    // First attempt: wrong credentials.
    let outcome: { ok: boolean; error?: string } = { ok: false };
    await act(async () => {
      outcome = await result.current.signIn('tester@example.com', 'wrong-password');
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe('Invalid email or password.');
    expect(result.current.loading).toBe(false);
    expect(result.current.data.session).toBe(false);

    // Retry with correct credentials: the same store recovers.
    await act(async () => {
      outcome = await result.current.signIn('tester@example.com', 'correct-password');
    });
    expect(outcome.ok).toBe(true);
    await waitFor(() => expect(result.current.data.session).toBe(true));
    expect(result.current.loading).toBe(false);
    expect(counts.login).toBe(2);
    expect(mockLocalStorage.getItem('auth_token')).toBe('fresh-token');
  });

  it('restores the session when /user/me/ hits a transient server error and recovers', async () => {
    mockLocalStorage.setItem('auth_token', 'saved-token');
    const { counts } = mockApi({ meFailFirstWith500: true });

    const { result } = renderHook(() => useAppStore());
    // The retry backs off ~1s before the second attempt.
    await waitFor(() => expect(result.current.data.session).toBe(true), { timeout: 10000 });

    expect(result.current.loading).toBe(false);
    expect(counts.me).toBe(2);
    expect(mockLocalStorage.getItem('auth_token')).toBe('saved-token');
  }, 15000);
});
