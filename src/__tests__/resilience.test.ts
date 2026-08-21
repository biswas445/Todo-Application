import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAppStore } from '@/store/useAppStore';

// Regression tests for two resilience behaviors:
// 1. A successful sign-in must establish the session even when the follow-up
//    collection load fails — otherwise a valid token is left stranded behind a
//    signed-out auth screen.
// 2. Save mutations (updateTask, updateNote, addTask) must resolve true/false so
//    callers can keep the user's typed input when a save fails instead of
//    clearing it optimistically.

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

function makeApiTask(id = 't1') {
  return {
    id,
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

describe('sign-in data-load resilience', () => {
  it('establishes the session even when a collection fails to load after login', async () => {
    const user = makeUser();
    // Login succeeds; one collection (tasks) then fails with a non-retried 4xx.
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname.replace(/^\/api/, '');
      const method = init?.method ?? 'GET';
      if (method === 'POST' && path === '/auth/login/') {
        return jsonResponse({ token: 'fresh-token', user });
      }
      if (method === 'GET' && path === '/tasks/') {
        return jsonResponse({ error: 'Forbidden' }, 403);
      }
      if (method === 'GET' && COLLECTION_PATHS.includes(path)) return jsonResponse([]);
      throw new Error(`Unhandled test request: ${method} ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAppStore());
    await flush();
    expect(result.current.data.session).toBe(false);

    let outcome: { ok: boolean; error?: string } = { ok: false };
    await act(async () => {
      outcome = await result.current.signIn('tester@example.com', 'password');
    });

    // Sign-in succeeds and the session is established — the valid token is used,
    // not left behind behind a signed-out auth screen.
    expect(outcome.ok).toBe(true);
    expect(result.current.data.session).toBe(true);
    expect(result.current.data.user?.email).toBe(user.email);
    expect(mockLocalStorage.getItem('auth_token')).toBe('fresh-token');
    // The failed collection load is surfaced as a retryable error toast.
    expect(result.current.error).toBeTruthy();
  });

  it('establishes the session with no error when the full load succeeds', async () => {
    const user = makeUser();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname.replace(/^\/api/, '');
      const method = init?.method ?? 'GET';
      if (method === 'POST' && path === '/auth/login/') {
        return jsonResponse({ token: 'fresh-token', user });
      }
      if (method === 'GET' && COLLECTION_PATHS.includes(path)) return jsonResponse([]);
      throw new Error(`Unhandled test request: ${method} ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAppStore());
    await flush();

    let outcome: { ok: boolean; error?: string } = { ok: false };
    await act(async () => {
      outcome = await result.current.signIn('tester@example.com', 'password');
    });

    expect(outcome.ok).toBe(true);
    expect(result.current.data.session).toBe(true);
    expect(result.current.error).toBeNull();
  });
});

describe('save mutations report success so typed input is not lost', () => {
  it('updateTask resolves false when the PATCH fails and true when it succeeds', async () => {
    const user = makeUser();
    let failPatch = true;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname.replace(/^\/api/, '');
      const method = init?.method ?? 'GET';
      if (method === 'GET' && path === '/user/me/') return jsonResponse(user);
      if (method === 'GET' && path === '/tasks/') return jsonResponse([makeApiTask()]);
      if (method === 'GET' && COLLECTION_PATHS.includes(path)) return jsonResponse([]);
      if (method === 'PATCH' && path === '/tasks/t1/') {
        if (failPatch) return jsonResponse({ error: 'Server error' }, 500);
        return jsonResponse({ ...makeApiTask(), title: 'Renamed' });
      }
      throw new Error(`Unhandled test request: ${method} ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    mockLocalStorage.setItem('auth_token', 'saved-token');

    const { result } = renderHook(() => useAppStore());
    await waitFor(() => expect(result.current.data.session).toBe(true));

    // Failed save resolves false and keeps the stale task (input is preserved
    // by the caller because it can see the failure).
    let ok = true;
    await act(async () => {
      ok = await result.current.updateTask('t1', { title: 'Renamed' });
    });
    expect(ok).toBe(false);
    expect(result.current.data.tasks[0].title).toBe('A task');
    expect(result.current.error).toBeTruthy();

    // Successful save resolves true and applies the update.
    failPatch = false;
    await act(async () => {
      ok = await result.current.updateTask('t1', { title: 'Renamed' });
    });
    expect(ok).toBe(true);
    expect(result.current.data.tasks[0].title).toBe('Renamed');
  });

  it('addTask resolves null when the POST fails so the input is not cleared', async () => {
    const user = makeUser();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname.replace(/^\/api/, '');
      const method = init?.method ?? 'GET';
      if (method === 'GET' && path === '/user/me/') return jsonResponse(user);
      if (method === 'GET' && COLLECTION_PATHS.includes(path)) return jsonResponse([]);
      if (method === 'POST' && path === '/tasks/') {
        return jsonResponse({ error: 'Server error' }, 500);
      }
      throw new Error(`Unhandled test request: ${method} ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    mockLocalStorage.setItem('auth_token', 'saved-token');

    const { result } = renderHook(() => useAppStore());
    await waitFor(() => expect(result.current.data.session).toBe(true));

    let created: unknown = 'sentinel';
    await act(async () => {
      created = await result.current.addTask({
        title: 'New task', description: '', completed: false, priority: 'Normal',
        dueDate: null, listId: null, tagIds: [], subtasks: [],
      });
    });
    // null signals failure so AddTask keeps the typed title.
    expect(created).toBeNull();
    expect(result.current.data.tasks).toHaveLength(0);
  });
});
