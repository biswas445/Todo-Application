import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAppStore, isNotificationAllowed } from '@/store/useAppStore';
import { settingsApi } from '@/api';
import { tomorrowStr } from '@/utils/format';

// Mock localStorage
const mockLocalStorage = {
  data: {} as Record<string, string>,
  getItem: vi.fn((key: string) => mockLocalStorage.data[key] || null),
  setItem: vi.fn((key: string, value: string) => { mockLocalStorage.data[key] = value; }),
  removeItem: vi.fn((key: string) => { delete mockLocalStorage.data[key]; }),
  clear: vi.fn(() => { mockLocalStorage.data = {}; }),
};

// Re-stub before every test: vi.unstubAllGlobals() in afterEach removes the
// stubs, so a module-level stub would not survive into later tests.
beforeEach(() => {
  vi.stubGlobal('localStorage', mockLocalStorage);
  mockLocalStorage.clear();
  mockLocalStorage.setItem('auth_token', 'test-token');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

interface ApiTask {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  priority: string;
  color: null;
  due_date: string | null;
  list_id: null;
  tag_ids: string[];
  subtasks: never[];
  created_at: string;
  updated_at: string;
}

function makeApiTask(id: string, title: string, dueDate: string | null): ApiTask {
  return {
    id,
    title,
    description: '',
    completed: false,
    priority: 'Normal',
    color: null,
    due_date: dueDate,
    list_id: null,
    tag_ids: [],
    subtasks: [],
    created_at: '2026-08-19T10:00:00Z',
    updated_at: '2026-08-19T10:00:00Z',
  };
}

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
  push_notifications?: boolean;
  task_reminders?: boolean;
}

function makeUser(overrides: Partial<MockUser> = {}): MockUser {
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
    ...overrides,
  };
}

interface NotificationCreate {
  message: string;
  dedup_key: string;
}

// Routes every request the store makes against in-memory state so tests can
// assert which notifications the client attempted to create.
function mockApi({ user: initialUser, tasks = [] }: { user: MockUser; tasks?: ApiTask[] }) {
  let user = { ...initialUser };
  const apiTasks = tasks.map((t) => ({ ...t }));
  const creates: NotificationCreate[] = [];
  const requests: { method: string; path: string }[] = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname.replace(/^\/api/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    requests.push({ method, path });

    const respond = (data: unknown, status = 200) => ({
      ok: status < 400,
      status,
      json: async () => data,
    });

    if (method === 'GET' && path === '/user/me/') return respond(user);
    if (method === 'GET' && path === '/lists/') return respond([]);
    if (method === 'GET' && path === '/tags/') return respond([]);
    if (method === 'GET' && path === '/tasks/') return respond(apiTasks);
    if (method === 'GET' && path === '/notes/') return respond([]);
    if (method === 'GET' && path === '/events/') return respond([]);
    if (method === 'GET' && path === '/notifications/') return respond([]);

    const toggleMatch = method === 'POST' && path.match(/^\/tasks\/([^/]+)\/toggle\/$/);
    if (toggleMatch) {
      const task = apiTasks.find((t) => t.id === toggleMatch[1]);
      if (!task) return respond({ error: 'Not found' }, 404);
      task.completed = !task.completed;
      task.updated_at = new Date().toISOString();
      return respond(task);
    }

    if (method === 'POST' && path === '/notifications/') {
      creates.push({ message: body.message, dedup_key: body.dedup_key });
      return respond(
        { id: `n${creates.length}`, read: false, created_at: new Date().toISOString(), ...body },
        201
      );
    }

    if (method === 'POST' && path === '/notifications/mark_all_read/') {
      return respond({ message: 'All notifications marked as read.', updated: 1 });
    }

    if (method === 'DELETE' && path === '/notifications/clear/') {
      return respond({ message: 'Notifications cleared.', deleted: creates.length });
    }

    if (method === 'PATCH' && path === '/user/update_profile/') {
      user = { ...user, ...body };
      return respond(user);
    }

    throw new Error(`Unhandled test request: ${method} ${path}`);
  });

  vi.stubGlobal('fetch', fetchMock);
  return { creates, requests, fetchMock };
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

describe('isNotificationAllowed (settings gate)', () => {
  it('allows everything when both settings are ON', () => {
    const settings = { pushNotifications: true, taskReminders: true };
    expect(isNotificationAllowed(settings, 'completion')).toBe(true);
    expect(isNotificationAllowed(settings, 'reminder')).toBe(true);
  });

  it('blocks all notifications when Push Notifications is OFF', () => {
    expect(isNotificationAllowed({ pushNotifications: false, taskReminders: true }, 'completion')).toBe(false);
    expect(isNotificationAllowed({ pushNotifications: false, taskReminders: true }, 'reminder')).toBe(false);
    expect(isNotificationAllowed({ pushNotifications: false, taskReminders: false }, 'completion')).toBe(false);
    expect(isNotificationAllowed({ pushNotifications: false, taskReminders: false }, 'reminder')).toBe(false);
  });

  it('keeps completion notifications but blocks reminders when Task Reminders is OFF', () => {
    const settings = { pushNotifications: true, taskReminders: false };
    expect(isNotificationAllowed(settings, 'completion')).toBe(true);
    expect(isNotificationAllowed(settings, 'reminder')).toBe(false);
  });
});

describe('notification settings defaults', () => {
  it('defaults both settings to ON when the API omits them', async () => {
    const user = makeUser();
    delete user.push_notifications;
    delete user.task_reminders;

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => user,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const settings = await settingsApi.getSettings();
    expect(settings.pushNotifications).toBe(true);
    expect(settings.taskReminders).toBe(true);
  });
});

describe('notification settings control the notification system', () => {
  it('creates completion and day-before reminders when both settings are ON', async () => {
    const { creates } = mockApi({
      user: makeUser(),
      tasks: [
        makeApiTask('t-done', 'Finish report', null),
        makeApiTask('t-tomorrow', 'Due Tomorrow', tomorrowStr()),
      ],
    });

    const { result } = renderHook(() => useAppStore());
    await waitFor(() => expect(result.current.data.session).toBe(true));

    await waitFor(() =>
      expect(creates.some((c) => c.dedup_key === `day-before:task:t-tomorrow:${tomorrowStr()}`)).toBe(true)
    );
    const reminder = creates.find((c) => c.dedup_key.startsWith('day-before:'))!;
    expect(reminder.message).toBe('Tomorrow: Due Tomorrow. Don\'t forget!');

    await act(async () => {
      await result.current.toggleTask('t-done');
    });
    await waitFor(() => expect(creates.some((c) => c.dedup_key === 'task-completed:t-done')).toBe(true));
    const completion = creates.find((c) => c.dedup_key.startsWith('task-completed:'))!;
    expect(completion.message).toBe('Hi, Test User You Finished This Task: Finish report.');

    // Scheduler re-runs on every data change; dedup must prevent repeats
    await flush();
    expect(creates.filter((c) => c.dedup_key.startsWith('day-before:'))).toHaveLength(1);
  });

  it('does not re-fire the completion notification when a task is un-completed then re-completed', async () => {
    const { creates } = mockApi({
      user: makeUser(),
      tasks: [makeApiTask('t-done', 'Finish report', null)],
    });

    const { result } = renderHook(() => useAppStore());
    await waitFor(() => expect(result.current.data.session).toBe(true));

    // Complete -> fires once
    await act(async () => {
      await result.current.toggleTask('t-done');
    });
    await waitFor(() => expect(creates.filter((c) => c.dedup_key === 'task-completed:t-done')).toHaveLength(1));

    // Un-complete -> no notification
    await act(async () => {
      await result.current.toggleTask('t-done');
    });
    await flush();
    expect(creates.filter((c) => c.dedup_key === 'task-completed:t-done')).toHaveLength(1);

    // Re-complete -> dedup key already consumed, so still no new notification
    await act(async () => {
      await result.current.toggleTask('t-done');
    });
    await flush();
    expect(creates.filter((c) => c.dedup_key === 'task-completed:t-done')).toHaveLength(1);
  });

  it('creates no notifications at all when Push Notifications is OFF', async () => {
    const { creates } = mockApi({
      user: makeUser({ push_notifications: false }),
      tasks: [
        makeApiTask('t-done', 'Finish report', null),
        makeApiTask('t-tomorrow', 'Due Tomorrow', tomorrowStr()),
      ],
    });

    const { result } = renderHook(() => useAppStore());
    await waitFor(() => expect(result.current.data.session).toBe(true));
    await flush();
    expect(creates).toHaveLength(0);

    await act(async () => {
      await result.current.toggleTask('t-done');
    });
    await flush();
    expect(creates).toHaveLength(0);
  });

  it('still creates completion notifications but no reminders when Task Reminders is OFF', async () => {
    const { creates } = mockApi({
      user: makeUser({ task_reminders: false }),
      tasks: [
        makeApiTask('t-done', 'Finish report', null),
        makeApiTask('t-tomorrow', 'Due Tomorrow', tomorrowStr()),
      ],
    });

    const { result } = renderHook(() => useAppStore());
    await waitFor(() => expect(result.current.data.session).toBe(true));
    await flush();
    expect(creates).toHaveLength(0);

    await act(async () => {
      await result.current.toggleTask('t-done');
    });
    await waitFor(() => expect(creates.some((c) => c.dedup_key === 'task-completed:t-done')).toBe(true));
    expect(creates.filter((c) => c.dedup_key.startsWith('day-before:'))).toHaveLength(0);
  });

  it('fires previously blocked reminders once Task Reminders is turned back ON, without duplicates', async () => {
    const { creates } = mockApi({
      user: makeUser({ task_reminders: false }),
      tasks: [makeApiTask('t-tomorrow', 'Due Tomorrow', tomorrowStr())],
    });

    const { result } = renderHook(() => useAppStore());
    await waitFor(() => expect(result.current.data.session).toBe(true));
    await flush();
    expect(creates).toHaveLength(0);

    await act(async () => {
      await result.current.updateSettings({ taskReminders: true });
    });

    await waitFor(() =>
      expect(creates.some((c) => c.dedup_key === `day-before:task:t-tomorrow:${tomorrowStr()}`)).toBe(true)
    );
    expect(result.current.data.settings.taskReminders).toBe(true);

    await flush();
    expect(creates).toHaveLength(1);
  });

  it('stops reminders again if Task Reminders is turned OFF after being ON', async () => {
    const { creates } = mockApi({
      user: makeUser(),
      tasks: [makeApiTask('t-tomorrow', 'Due Tomorrow', tomorrowStr())],
    });

    const { result } = renderHook(() => useAppStore());
    await waitFor(() => expect(result.current.data.session).toBe(true));
    await waitFor(() => expect(creates).toHaveLength(1));

    await act(async () => {
      await result.current.updateSettings({ taskReminders: false });
    });
    await flush();

    // The already-created reminder is not duplicated after the setting flips
    expect(creates).toHaveLength(1);
    expect(result.current.data.settings.taskReminders).toBe(false);
  });

  it('clears all notifications and does not recreate cleared reminders', async () => {
    const { creates } = mockApi({
      user: makeUser(),
      tasks: [makeApiTask('t-tomorrow', 'Due Tomorrow', tomorrowStr())],
    });

    const { result } = renderHook(() => useAppStore());
    await waitFor(() => expect(result.current.data.session).toBe(true));
    await waitFor(() => expect(result.current.data.notifications).toHaveLength(1));
    expect(creates).toHaveLength(1);

    await act(async () => {
      await result.current.clearNotifications();
    });
    expect(result.current.data.notifications).toHaveLength(0);

    // Force scheduler re-runs: dedup keys must stay consumed so the cleared
    // reminder is not generated again.
    await act(async () => {
      await result.current.updateSettings({ taskReminders: false });
      await result.current.updateSettings({ taskReminders: true });
    });
    await flush();
    expect(creates).toHaveLength(1);
    expect(result.current.data.notifications).toHaveLength(0);
  });

  it('does not regenerate cleared reminders after sign-out and re-login', async () => {
    const { creates } = mockApi({
      user: makeUser(),
      tasks: [makeApiTask('t-tomorrow', 'Due Tomorrow', tomorrowStr())],
    });

    // First session: the reminder is created and then cleared.
    const first = renderHook(() => useAppStore());
    await waitFor(() => expect(first.result.current.data.session).toBe(true));
    await waitFor(() => expect(creates).toHaveLength(1));

    await act(async () => {
      await first.result.current.clearNotifications();
    });
    expect(first.result.current.data.notifications).toHaveLength(0);
    first.unmount();

    // Second session (re-login): the DB is empty but the consumed dedup key is
    // restored from localStorage, so the still-eligible reminder is not recreated.
    const second = renderHook(() => useAppStore());
    await waitFor(() => expect(second.result.current.data.session).toBe(true));
    await flush();
    expect(creates).toHaveLength(1);
    expect(second.result.current.data.notifications).toHaveLength(0);
  });
});

describe('mark all notifications read', () => {
  it('persists via a single bulk request instead of one PATCH per notification', async () => {
    const { creates, requests } = mockApi({
      user: makeUser(),
      tasks: [makeApiTask('t-tomorrow', 'Due Tomorrow', tomorrowStr())],
    });

    const { result } = renderHook(() => useAppStore());
    await waitFor(() => expect(result.current.data.session).toBe(true));
    await waitFor(() => expect(result.current.data.notifications).toHaveLength(1));

    // Second unread notification so the bulk path is unambiguous.
    await act(async () => {
      result.current.applyExternalNotification({
        id: 'n-ext',
        message: 'External notification',
        dedup_key: 'external:1',
        read: false,
        created_at: new Date().toISOString(),
      });
    });
    expect(result.current.data.notifications).toHaveLength(2);

    await act(async () => {
      await result.current.markAllNotificationsRead();
    });

    expect(result.current.data.notifications.every((n) => n.read)).toBe(true);
    const bulkCalls = requests.filter((r) => r.path === '/notifications/mark_all_read/');
    const patchCalls = requests.filter((r) => r.method === 'PATCH' && r.path.startsWith('/notifications/'));
    expect(bulkCalls).toHaveLength(1);
    expect(patchCalls).toHaveLength(0);
    expect(creates).toHaveLength(1);
  });

  it('does nothing when there are no unread notifications', async () => {
    const { requests } = mockApi({ user: makeUser(), tasks: [] });

    const { result } = renderHook(() => useAppStore());
    await waitFor(() => expect(result.current.data.session).toBe(true));
    await flush();

    await act(async () => {
      await result.current.markAllNotificationsRead();
    });

    expect(requests.filter((r) => r.path === '/notifications/mark_all_read/')).toHaveLength(0);
  });
});

describe('cross-device notification sync', () => {
  it('upserts notifications broadcast by the backend without duplicating', async () => {
    mockApi({ user: makeUser(), tasks: [] });

    const { result } = renderHook(() => useAppStore());
    await waitFor(() => expect(result.current.data.session).toBe(true));

    const apiNotification = {
      id: 'n-ext',
      message: 'Hi, Test User You Finished This Task: Finish report.',
      dedup_key: 'task-completed:t-done',
      read: false,
      created_at: new Date().toISOString(),
    };

    await act(async () => {
      result.current.applyExternalNotification(apiNotification);
    });
    expect(result.current.data.notifications).toHaveLength(1);

    // The same broadcast replayed (e.g. reconnect echo) must not duplicate.
    await act(async () => {
      result.current.applyExternalNotification({ ...apiNotification, read: true });
    });
    expect(result.current.data.notifications).toHaveLength(1);
    expect(result.current.data.notifications[0].read).toBe(true);
  });

  it('consumes the dedup key so this device does not recreate a remote notification', async () => {
    const { creates } = mockApi({
      user: makeUser(),
      tasks: [makeApiTask('t-done', 'Finish report', null)],
    });

    const { result } = renderHook(() => useAppStore());
    await waitFor(() => expect(result.current.data.session).toBe(true));
    await flush();
    expect(creates).toHaveLength(0);

    // Another device completed the task and this one received the broadcast.
    await act(async () => {
      result.current.applyExternalNotification({
        id: 'n-ext',
        message: 'Hi, Test User You Finished This Task: Finish report.',
        dedup_key: 'task-completed:t-done',
        read: false,
        created_at: new Date().toISOString(),
      });
    });

    // Toggling the same task locally must not POST a duplicate notification.
    await act(async () => {
      await result.current.toggleTask('t-done');
    });
    await flush();
    expect(creates).toHaveLength(0);
    expect(result.current.data.notifications).toHaveLength(1);
  });
});
