import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAppStore } from '@/store/useAppStore';

// Regression tests for mid-session auth loss and optimistic-update rollback:
// - a 401 on any authenticated request while signed in must sign the user out
//   globally (clear the token and drop the session),
// - a failed bulk "mark all read" must roll the optimistic read-flag back.

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
  mockLocalStorage.setItem('auth_token', 'saved-token');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeUser() {
  return {
    id: 'u1',
    username: 'tester@example.com',
    email: 'tester@example.com',
    first_name: 'Test',
    last_name: 'User',
    bio: '',
    timezone: 'UTC',
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

function makeApiTask() {
  return {
    id: 't1',
    title: 'A task',
    description: '',
    completed: false,
    priority: 'Normal',
    color: null,
    due_date: null,
    list_id: null,
    tag_ids: [],
    subtasks: [],
    created_at: '2026-08-19T10:00:00Z',
    updated_at: '2026-08-19T10:00:00Z',
  };
}

const COLLECTION_PATHS = ['/lists/', '/tags/', '/tasks/', '/notes/', '/events/', '/notifications/'];

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

describe('global 401 handling mid-session', () => {
  it('signs the user out when an authenticated request is rejected with 401', async () => {
    const user = makeUser();
    // Init succeeds; once flip401 is set, the next authenticated call is
    // rejected so the global handler must end the session.
    let flip401 = false;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname.replace(/^\/api/, '');
      const method = init?.method ?? 'GET';

      if (flip401) return jsonResponse({ detail: 'Invalid token.' }, 401);

      if (method === 'GET' && path === '/user/me/') return jsonResponse(user);
      if (method === 'GET' && path === '/tasks/') return jsonResponse([makeApiTask()]);
      if (method === 'GET' && COLLECTION_PATHS.includes(path)) return jsonResponse([]);

      throw new Error(`Unhandled test request: ${method} ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAppStore());
    await waitFor(() => expect(result.current.data.session).toBe(true));
    expect(mockLocalStorage.getItem('auth_token')).toBe('saved-token');

    // Token is invalidated server-side; the next action 401s.
    flip401 = true;
    await act(async () => {
      await result.current.toggleTask('t1');
    });

    await waitFor(() => expect(result.current.data.session).toBe(false));
    expect(mockLocalStorage.getItem('auth_token')).toBeNull();
    expect(result.current.error).toBeTruthy();
  });

  it('does not sign out on a 401 before a session exists (failed login)', async () => {
    // No token saved, login returns 401: the global handler must stay quiet so
    // the sign-in form can show the credential error instead of being reset.
    mockLocalStorage.removeItem('auth_token');

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname.replace(/^\/api/, '');
      const method = init?.method ?? 'GET';
      if (method === 'POST' && path === '/auth/login/') {
        return jsonResponse({ error: 'Invalid email or password.' }, 401);
      }
      if (method === 'GET') return jsonResponse([]);
      throw new Error(`Unhandled test request: ${method} ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAppStore());
    await flush();

    let outcome: { ok: boolean; error?: string } = { ok: false };
    await act(async () => {
      outcome = await result.current.signIn('tester@example.com', 'wrong');
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe('Invalid email or password.');
    expect(result.current.data.session).toBe(false);
  });
});

describe('mark all read rollback', () => {
  it('reverts notifications to unread when the bulk request fails', async () => {
    const user = makeUser();
    const notification = {
      id: 'n1',
      message: 'A notification',
      dedup_key: 'k1',
      read: false,
      created_at: '2026-08-19T10:00:00Z',
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname.replace(/^\/api/, '');
      const method = init?.method ?? 'GET';

      if (method === 'GET' && path === '/user/me/') return jsonResponse(user);
      if (method === 'GET' && path === '/notifications/') return jsonResponse([notification]);
      if (method === 'GET' && COLLECTION_PATHS.includes(path)) return jsonResponse([]);
      if (method === 'POST' && path === '/notifications/mark_all_read/') {
        return jsonResponse({ error: 'Server error' }, 500);
      }

      throw new Error(`Unhandled test request: ${method} ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAppStore());
    await waitFor(() => expect(result.current.data.session).toBe(true));
    await waitFor(() => expect(result.current.data.notifications).toHaveLength(1));
    expect(result.current.data.notifications[0].read).toBe(false);

    await act(async () => {
      await result.current.markAllNotificationsRead();
    });

    // The optimistic read-flag must be rolled back after the failed request.
    expect(result.current.data.notifications[0].read).toBe(false);
    expect(result.current.error).toBeTruthy();
  });
});
