import { useState, useCallback, useEffect, useRef } from 'react';
import type { AppData, Task, Subtask, ListItem, TagItem, Note, CalendarEvent, Notification, Settings, User, TaskColor, EntityId } from '@/types';
export type { AppData, Task, ListItem, TagItem, Note, CalendarEvent, Notification, Settings, User, TaskColor, EntityId };
import {
  authApi, listsApi, tagsApi, tasksApi, notesApi, eventsApi, settingsApi,
  notificationsApi,
  mapUserToSettings,
  setOnUnauthorizedHandler,
  ApiError
} from '@/api';
import type {
  ApiNotification, ApiUser, ApiTask, ApiList, ApiTag, ApiNote, ApiEvent, ApiSubtask
} from '@/api';
import { formatTime, todayStr, tomorrowStr } from '@/utils/format';

const AUTH_TOKEN_KEY = 'auth_token';

// Helper to save/load auth token
function saveAuthToken(token: string | null) {
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

const CONSUMED_KEYS_STORAGE_PREFIX = 'consumed_notification_keys:';

// Durable record of the notification dedup keys a user has already consumed.
// The in-memory seenNotificationKeys set is rebuilt from this on sign-in so
// that clearing notifications (which empties the DB) does not let the reminder
// scheduler regenerate reminders for still-eligible tasks/events after a
// re-login. Keyed per user id so accounts on a shared browser stay isolated.
function loadConsumedKeys(userId: EntityId): Set<string> {
  try {
    const raw = localStorage.getItem(CONSUMED_KEYS_STORAGE_PREFIX + userId);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : []);
  } catch {
    return new Set();
  }
}

function persistConsumedKeys(userId: EntityId, keys: Set<string>) {
  try {
    localStorage.setItem(CONSUMED_KEYS_STORAGE_PREFIX + userId, JSON.stringify([...keys]));
  } catch {
    // Storage may be full or unavailable; in-memory dedup still protects this session.
  }
}

// Merge the durable consumed keys with whatever is currently in the DB,
// reseed localStorage from the union, and return it so the caller can assign
// it to the in-memory seenNotificationKeys ref.
function rebuildConsumedKeys(userId: EntityId, notifications: ApiNotification[]): Set<string> {
  const consumed = loadConsumedKeys(userId);
  notifications.forEach((n) => {
    if (n.dedup_key) consumed.add(n.dedup_key);
  });
  persistConsumedKeys(userId, consumed);
  return consumed;
}

const nowISO = () => new Date().toISOString();

export type NotificationKind = 'completion' | 'reminder';

// Settings gate for every notification attempt:
// - Push Notifications is the master switch — OFF blocks everything.
// - Task Reminders only controls reminder-type notifications; completion
//   notifications still fire when it is OFF.
export function isNotificationAllowed(
  settings: Pick<Settings, 'pushNotifications' | 'taskReminders'>,
  kind: NotificationKind
): boolean {
  if (!settings.pushNotifications) return false;
  if (kind === 'reminder' && !settings.taskReminders) return false;
  return true;
}


// Normalize API response to ensure it's always an array
function normalizeCollection<T>(response: unknown): T[] {
  if (Array.isArray(response)) {
    return response;
  }
  if (response && typeof response === 'object' && 'results' in response && Array.isArray((response as { results: unknown }).results)) {
    return (response as { results: T[] }).results;
  }
  return [];
}

// Default empty state
function emptyState(): AppData {
  return {
    tasks: [],
    lists: [],
    tags: [],
    notes: [],
    events: [],
    notifications: [],
    user: null,
    settings: {
      displayName: '',
      email: '',
      timezone: 'UTC',
      bio: '',
      language: 'English (US)',
      dateFormat: 'DD-MM-YY',
      startOfWeek: 'Monday',
      timeFormat: '12-hour',
      pushNotifications: true,
      taskReminders: true,
    },
    session: false,
  };
}

export function useAppStore() {
  const [data, setData] = useState<AppData>(emptyState());
  // `loading` tracks the initial session restore only. App.tsx unmounts the
  // whole auth/workspace UI while it is true, so auth mutations (sign in/up,
  // password change, account deletion) must use `authPending` instead —
  // otherwise their error/success setState calls would hit an unmounted
  // component and never render.
  const [loading, setLoading] = useState(false);
  const [authPending, setAuthPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);
  // Dedup keys of notifications already persisted for this user. Prevents
  // reminder checks and completion events from creating duplicates.
  const seenNotificationKeys = useRef<Set<string>>(new Set());
  // Latest data snapshot so stable callbacks (toggleTask, scheduler) can
  // read current user/tasks/events without stale closures.
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);

  // Initialize: check for existing session and load data
  useEffect(() => {
    async function init() {
      const token = getAuthToken();
      if (!token) {
        setData(emptyState());
        return;
      }

      try {
        setLoading(true);
        // Fetch all data in parallel. getMe resolves to null only on a 401
        // (invalid/expired token); any other failure rethrows so a transient
        // or server error does not get mistaken for "signed out".
        const [user, listsResponse, tagsResponse, tasksResponse, notesResponse, eventsResponse, notificationsResponse] = await Promise.all([
          authApi.getMe().catch((e) => {
            if (e instanceof ApiError && e.status === 401) return null;
            throw e;
          }),
          listsApi.getAll(),
          tagsApi.getAll(),
          tasksApi.getAll(),
          notesApi.getAll(),
          eventsApi.getAll(),
          notificationsApi.getAll().catch(() => []),
        ]);

        // Normalize all collections to arrays
        const lists = normalizeCollection<ApiList>(listsResponse);
        const tags = normalizeCollection<ApiTag>(tagsResponse);
        const tasks = normalizeCollection<ApiTask>(tasksResponse);
        const notes = normalizeCollection<ApiNote>(notesResponse);
        const events = normalizeCollection<ApiEvent>(eventsResponse);
        const notifications = normalizeCollection<ApiNotification>(notificationsResponse);

        if (user) {
          // Build settings directly from the user already fetched above to
          // avoid a second /user/me/ round-trip via settingsApi.getSettings().
          const settings = mapUserToSettings(user);

          seenNotificationKeys.current = rebuildConsumedKeys(user.id, notifications);
          setData({
            tasks: tasks.map(mapApiTaskToFrontend),
            lists: lists.map(mapApiListToFrontend),
            tags: tags.map(mapApiTagToFrontend),
            notes: notes.map(mapApiNoteToFrontend),
            events: events.map(mapApiEventToFrontend),
            notifications: notifications.map(mapApiNotificationToFrontend),
            user: mapApiUserToFrontend(user),
            settings,
            session: true,
          });
        } else {
          // getMe hit a 401: the stored token is invalid/expired. Only an auth
          // failure should end the session and delete the token.
          saveAuthToken(null);
          setData(emptyState());
          setError('Your session has expired. Please sign in again.');
        }
      } catch (err) {
        console.error('Failed to initialize app data:', err);
        if (err instanceof ApiError && err.status === 401) {
          saveAuthToken(null);
          setData(emptyState());
          setError('Your session has expired. Please sign in again.');
        } else {
          // Transient/network/server error: keep the token and the session so
          // the user is not force-signed-out by a backend hiccup; surface a
          // retryable error instead.
          setError(err instanceof Error ? err.message : 'Failed to load data');
        }
      } finally {
        setLoading(false);
        initialized.current = true;
      }
    }

    init();
  }, []);

  // Global 401 handling: if any authenticated request is rejected with a 401
  // mid-session (token expired/rotated/revoked), sign the user out. Guarded by
  // `session` so the init and sign-in flows — which handle their own 401s and
  // run with session=false — are never clobbered by a stray sign-out.
  useEffect(() => {
    const handleUnauthorized = () => {
      if (!dataRef.current.session) return;
      saveAuthToken(null);
      seenNotificationKeys.current = new Set();
      setData(emptyState());
      setError('Your session has expired. Please sign in again.');
    };
    setOnUnauthorizedHandler(handleUnauthorized);
    return () => setOnUnauthorizedHandler(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const signUp = useCallback(async (name: string, email: string, password: string): Promise<{ ok: boolean; error?: string }> => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      return { ok: false, error: 'All fields are required.' };
    }
    if (password.length < 8) {
      return { ok: false, error: 'Password must be at least 8 characters.' };
    }

    try {
      setAuthPending(true);
      await authApi.register({
        username: email.trim(),
        email: email.trim(),
        password,
        first_name: name.trim().split(' ')[0],
        last_name: name.trim().split(' ').slice(1).join(' '),
      });

      // Do NOT auto-login after signup. Just return success.
      // User will be redirected to signin page to manually log in.
      return { ok: true };
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Registration failed';
      return { ok: false, error: message };
    } finally {
      setAuthPending(false);
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<{ ok: boolean; error?: string }> => {
    if (!email.trim() || !password.trim()) {
      return { ok: false, error: 'Email and password are required.' };
    }

    try {
      setAuthPending(true);
      const response = await authApi.login({ email: email.trim(), password });
      saveAuthToken(response.token);

      const [listsResponse, tagsResponse, tasksResponse, notesResponse, eventsResponse, notificationsResponse] = await Promise.all([
        listsApi.getAll(),
        tagsApi.getAll(),
        tasksApi.getAll(),
        notesApi.getAll(),
        eventsApi.getAll(),
        notificationsApi.getAll().catch(() => []),
      ]);

      // Normalize all collections to arrays
      const lists = normalizeCollection<ApiList>(listsResponse);
      const tags = normalizeCollection<ApiTag>(tagsResponse);
      const tasks = normalizeCollection<ApiTask>(tasksResponse);
      const notes = normalizeCollection<ApiNote>(notesResponse);
      const events = normalizeCollection<ApiEvent>(eventsResponse);
      const notifications = normalizeCollection<ApiNotification>(notificationsResponse);

      // Build settings from the login response user; no extra /user/me/ call.
      const settings = mapUserToSettings(response.user);

      seenNotificationKeys.current = rebuildConsumedKeys(response.user.id, notifications);
      setData({
        tasks: tasks.map(mapApiTaskToFrontend),
        lists: lists.map(mapApiListToFrontend),
        tags: tags.map(mapApiTagToFrontend),
        notes: notes.map(mapApiNoteToFrontend),
        events: events.map(mapApiEventToFrontend),
        notifications: notifications.map(mapApiNotificationToFrontend),
        user: mapApiUserToFrontend(response.user),
        settings,
        session: true,
      });
      // A successful sign-in supersedes any stale init error (e.g. the
      // expired-session message from a failed restore attempt).
      setError(null);
      return { ok: true };
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Login failed';
      return { ok: false, error: message };
    } finally {
      setAuthPending(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout().catch(() => {});
    } finally {
      saveAuthToken(null);
      seenNotificationKeys.current = new Set();
      setData(emptyState());
    }
  }, []);

  const changePassword = useCallback(async (current: string, next: string): Promise<{ ok: boolean; error?: string }> => {
    if (next.length < 8) {
      return { ok: false, error: 'New password must be at least 8 characters.' };
    }
    try {
      setAuthPending(true);
      await authApi.changePassword(current, next);
      return { ok: true };
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Password change failed';
      return { ok: false, error: message };
    } finally {
      setAuthPending(false);
    }
  }, []);

  const deleteAccount = useCallback(async (password: string): Promise<{ ok: boolean; error?: string }> => {
    if (!data.user) {
      return { ok: false, error: 'No user logged in.' };
    }
    try {
      setAuthPending(true);
      await authApi.deleteAccount(password);
      saveAuthToken(null);
      setData(emptyState());
      return { ok: true };
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Account deletion failed';
      return { ok: false, error: message };
    } finally {
      setAuthPending(false);
    }
  }, [data.user]);

  const addTask = useCallback(async (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task | null> => {
    try {
      const apiTask = await tasksApi.create({
        title: task.title,
        description: task.description,
        completed: task.completed,
        priority: task.priority,
        color: task.color || null,
        due_date: task.dueDate,
        list: task.listId,
        tag_ids: task.tagIds,
      });
      const newTask = mapApiTaskToFrontend(apiTask);
      setData((d) => ({ ...d, tasks: [newTask, ...d.tasks] }));
      return newTask;
    } catch (err) {
      console.error('Failed to add task:', err);
      setError(err instanceof Error ? err.message : 'Failed to add task');
      return null;
    }
  }, []);

  const updateTask = useCallback(async (id: EntityId, updates: Partial<Task>) => {
    try {
      const apiUpdates: Record<string, unknown> = {};
      if (updates.title !== undefined) apiUpdates.title = updates.title;
      if (updates.description !== undefined) apiUpdates.description = updates.description;
      if (updates.completed !== undefined) apiUpdates.completed = updates.completed;
      if (updates.priority !== undefined) apiUpdates.priority = updates.priority;
      if (updates.color !== undefined) apiUpdates.color = updates.color;
      if (updates.dueDate !== undefined) apiUpdates.due_date = updates.dueDate;
      if (updates.listId !== undefined) apiUpdates.list = updates.listId;
      if (updates.tagIds !== undefined) apiUpdates.tag_ids = updates.tagIds;

      const apiTask = await tasksApi.update(id, apiUpdates);
      const updatedTask = mapApiTaskToFrontend(apiTask);
      setData((d) => ({ ...d, tasks: d.tasks.map((t) => t.id === id ? updatedTask : t) }));
    } catch (err) {
      console.error('Failed to update task:', err);
      setError(err instanceof Error ? err.message : 'Failed to update task');
    }
  }, []);

  const deleteTask = useCallback(async (id: EntityId) => {
    try {
      await tasksApi.delete(id);
      setData((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== id) }));
    } catch (err) {
      console.error('Failed to delete task:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete task');
    }
  }, []);

  const addNotification = useCallback(async (message: string, dedupKey: string, kind: NotificationKind): Promise<void> => {
    // Blocked attempts do NOT consume their dedup key, so re-enabling a
    // setting lets still-eligible notifications fire later.
    if (!isNotificationAllowed(dataRef.current.settings, kind)) return;

    if (seenNotificationKeys.current.has(dedupKey)) return;
    seenNotificationKeys.current.add(dedupKey);
    try {
      const apiNotification = await notificationsApi.create({ message, dedup_key: dedupKey });
      const notification = mapApiNotificationToFrontend(apiNotification);
      // Upsert rather than append: the backend also broadcasts this same
      // notification over the WebSocket, and that broadcast can arrive before
      // this POST response resolves. Appending blindly would insert it twice
      // (duplicate entry + double-counted unread badge).
      setData((d) => {
        const isSame = (n: Notification) =>
          n.id === notification.id ||
          (!!notification.dedupKey && n.dedupKey === notification.dedupKey);
        const exists = d.notifications.some(isSame);
        return {
          ...d,
          notifications: exists
            ? d.notifications.map((n) => (isSame(n) ? notification : n))
            : [...d.notifications, notification],
        };
      });
      // Persist the consumed key so it survives Clear + re-login.
      const userId = dataRef.current.user?.id;
      if (userId) {
        persistConsumedKeys(userId, seenNotificationKeys.current);
      }
    } catch (err) {
      // Allow a retry if the request failed
      seenNotificationKeys.current.delete(dedupKey);
      console.error('Failed to create notification:', err);
    }
  }, []);

  const clearNotifications = useCallback(async () => {
    try {
      await notificationsApi.clearAll();
      // Keep seenNotificationKeys intact: the events behind cleared
      // notifications stay consumed so the scheduler does not instantly
      // recreate the reminders the user just cleared.
      setData((d) => ({ ...d, notifications: [] }));
    } catch (err) {
      console.error('Failed to clear notifications:', err);
      setError(err instanceof Error ? err.message : 'Failed to clear notifications');
    }
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    const unread = dataRef.current.notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    // Optimistic update; a single bulk endpoint call persists it. Capture the
    // ids we flipped so a failed request can roll exactly those back to unread
    // without discarding any notification that arrives in the meantime.
    const unreadIds = new Set(unread.map((n) => n.id));
    setData((d) => ({
      ...d,
      notifications: d.notifications.map((n) => (n.read ? n : { ...n, read: true })),
    }));
    try {
      await notificationsApi.markAllRead();
    } catch (err) {
      // Roll back the optimistic flip so the badge/list reflects reality.
      setData((d) => ({
        ...d,
        notifications: d.notifications.map((n) =>
          unreadIds.has(n.id) ? { ...n, read: false } : n
        ),
      }));
      console.error('Failed to mark notifications read:', err);
      setError(err instanceof Error ? err.message : 'Failed to mark notifications read');
    }
  }, []);

  const toggleTask = useCallback(async (id: EntityId) => {
    try {
      const apiTask = await tasksApi.toggle(id);
      const updatedTask = mapApiTaskToFrontend(apiTask);
      setData((d) => ({ ...d, tasks: d.tasks.map((t) => t.id === id ? updatedTask : t) }));
      if (updatedTask.completed) {
        const name = dataRef.current.user?.name || dataRef.current.settings.displayName || 'there';
        await addNotification(
          `Hi, ${name} You Finished This Task: ${updatedTask.title}.`,
          // Dedup on task id only: including updatedAt would re-fire the
          // notification every time the task is un-completed and re-completed.
          `task-completed:${updatedTask.id}`,
          'completion'
        );
      }
    } catch (err) {
      console.error('Failed to toggle task:', err);
      setError(err instanceof Error ? err.message : 'Failed to toggle task');
    }
  }, [addNotification]);

  // Scheduled reminders: one-day-before and exact-time notifications for
  // pending tasks (due date) and calendar events (date + start time).
  // Runs on every data change and every 30s while signed in. Each reminder
  // carries a stable dedup key (kind:entity-type:id:date), so it is created
  // at most once no matter how often the check runs. All date/time math uses
  // local time via the YYYY-MM-DD helpers in utils/format.
  useEffect(() => {
    if (!data.session) return;

    const checkScheduledReminders = () => {
      const today = todayStr();
      const tomorrow = tomorrowStr();
      const now = new Date();
      const timeFormat = data.settings.timeFormat;

      data.tasks.forEach((task) => {
        if (task.completed || !task.dueDate) return;
        if (task.dueDate === tomorrow) {
          addNotification(
            `Tomorrow: ${task.title}. Don't forget!`,
            `day-before:task:${task.id}:${task.dueDate}`,
            'reminder'
          );
        }
        if (task.dueDate === today) {
          addNotification(
            `It's time for: ${task.title}. Don't forget!`,
            `due-time:task:${task.id}:${task.dueDate}`,
            'reminder'
          );
        }
      });

      data.events.forEach((event) => {
        const timeLabel = formatTime(event.startTime, timeFormat);
        if (event.date === tomorrow) {
          addNotification(
            `Tomorrow at ${timeLabel}: ${event.title}. Don't forget!`,
            `day-before:event:${event.id}:${event.date}`,
            'reminder'
          );
        }
        if (event.date === today) {
          const [h, m] = event.startTime.split(':').map(Number);
          const scheduled = new Date();
          scheduled.setHours(h || 0, m || 0, 0, 0);
          if (now >= scheduled) {
            addNotification(
              `It's time for: ${event.title} at ${timeLabel}. Don't forget!`,
              `due-time:event:${event.id}:${event.date}`,
              'reminder'
            );
          }
        }
      });
    };

    checkScheduledReminders();
    const interval = setInterval(checkScheduledReminders, 30000);
    return () => clearInterval(interval);
  }, [data.session, data.tasks, data.events, data.settings.timeFormat, data.settings.pushNotifications, data.settings.taskReminders, addNotification]);

  const addSubtask = useCallback(async (taskId: EntityId, title: string) => {
    try {
      const apiSubtask = await tasksApi.addSubtask(taskId, title);
      setData((d) => ({
        ...d,
        tasks: d.tasks.map((t) =>
          t.id === taskId
            ? {
                ...t,
                subtasks: [...t.subtasks, mapApiSubtaskToFrontend(apiSubtask)],
                updatedAt: nowISO(),
              }
            : t
        ),
      }));
    } catch (err) {
      console.error('Failed to add subtask:', err);
      setError(err instanceof Error ? err.message : 'Failed to add subtask');
    }
  }, []);

  const toggleSubtask = useCallback(async (taskId: EntityId, subId: EntityId) => {
    try {
      const apiSubtask = await tasksApi.toggleSubtask(taskId, subId);
      setData((d) => ({
        ...d,
        tasks: d.tasks.map((t) =>
          t.id === taskId
            ? {
                ...t,
                subtasks: t.subtasks.map((s) =>
                  s.id === subId ? mapApiSubtaskToFrontend(apiSubtask) : s
                ),
                updatedAt: nowISO(),
              }
            : t
        ),
      }));
    } catch (err) {
      console.error('Failed to toggle subtask:', err);
      setError(err instanceof Error ? err.message : 'Failed to toggle subtask');
    }
  }, []);

  const editSubtask = useCallback(async (taskId: EntityId, subId: EntityId, title: string) => {
    try {
      const apiSubtask = await tasksApi.updateSubtask(subId, title);
      setData((d) => ({
        ...d,
        tasks: d.tasks.map((t) =>
          t.id === taskId
            ? {
                ...t,
                subtasks: t.subtasks.map((s) =>
                  s.id === subId ? mapApiSubtaskToFrontend(apiSubtask) : s
                ),
                updatedAt: nowISO(),
              }
            : t
        ),
      }));
    } catch (err) {
      console.error('Failed to edit subtask:', err);
      setError(err instanceof Error ? err.message : 'Failed to edit subtask');
    }
  }, []);

  const deleteSubtask = useCallback(async (taskId: EntityId, subId: EntityId) => {
    try {
      await tasksApi.deleteSubtask(taskId, subId);
      setData((d) => ({
        ...d,
        tasks: d.tasks.map((t) =>
          t.id === taskId
            ? {
                ...t,
                subtasks: t.subtasks.filter((s) => s.id !== subId),
                updatedAt: nowISO(),
              }
            : t
        ),
      }));
    } catch (err) {
      console.error('Failed to delete subtask:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete subtask');
    }
  }, []);

  const addList = useCallback(async (label: string, color?: TaskColor): Promise<ListItem | null> => {
    try {
      const apiList = await listsApi.create(label, color);
      const newList = mapApiListToFrontend(apiList);
      setData((d) => ({ ...d, lists: [...d.lists, newList] }));
      return newList;
    } catch (err) {
      console.error('Failed to add list:', err);
      setError(err instanceof Error ? err.message : 'Failed to add list');
      return null;
    }
  }, []);

  const updateList = useCallback(async (id: EntityId, updates: Partial<ListItem>) => {
    try {
      const apiList = await listsApi.update(id, updates);
      const updatedList = mapApiListToFrontend(apiList);
      setData((d) => ({ ...d, lists: d.lists.map((l) => l.id === id ? updatedList : l) }));
    } catch (err) {
      console.error('Failed to update list:', err);
      setError(err instanceof Error ? err.message : 'Failed to update list');
    }
  }, []);

  const deleteList = useCallback(async (id: EntityId) => {
    try {
      await listsApi.delete(id);
      setData((d) => ({
        ...d,
        lists: d.lists.filter((l) => l.id !== id),
        tasks: d.tasks.map((t) => (t.listId === id ? { ...t, listId: null } : t)),
      }));
    } catch (err) {
      console.error('Failed to delete list:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete list');
    }
  }, []);

  const addTag = useCallback(async (label: string, color?: TaskColor): Promise<TagItem | null> => {
    try {
      const apiTag = await tagsApi.create(label, color);
      const newTag = mapApiTagToFrontend(apiTag);
      setData((d) => ({ ...d, tags: [...d.tags, newTag] }));
      return newTag;
    } catch (err) {
      console.error('Failed to add tag:', err);
      setError(err instanceof Error ? err.message : 'Failed to add tag');
      return null;
    }
  }, []);

  const updateTag = useCallback(async (id: EntityId, updates: Partial<TagItem>) => {
    try {
      const apiTag = await tagsApi.update(id, updates);
      const updatedTag = mapApiTagToFrontend(apiTag);
      setData((d) => ({ ...d, tags: d.tags.map((t) => t.id === id ? updatedTag : t) }));
    } catch (err) {
      console.error('Failed to update tag:', err);
      setError(err instanceof Error ? err.message : 'Failed to update tag');
    }
  }, []);

  const deleteTag = useCallback(async (id: EntityId) => {
    try {
      await tagsApi.delete(id);
      setData((d) => ({
        ...d,
        tags: d.tags.filter((t) => t.id !== id),
        tasks: d.tasks.map((t) => ({ ...t, tagIds: t.tagIds.filter((tid) => tid !== id) })),
      }));
    } catch (err) {
      console.error('Failed to delete tag:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete tag');
    }
  }, []);

  const updateUser = useCallback(async (updates: Partial<User>) => {
    try {
      const apiUser = await authApi.updateProfile(updates);
      const updatedUser = mapApiUserToFrontend(apiUser);
      setData((d) => ({
        ...d,
        user: updatedUser,
        settings: {
          ...d.settings,
          ...(updates.first_name !== undefined || updates.last_name !== undefined
            ? { displayName: `${updates.first_name || d.user?.first_name || ''} ${updates.last_name || d.user?.last_name || ''}`.trim() }
            : {}),
          ...(updates.bio !== undefined ? { bio: updates.bio } : {}),
          ...(updates.timezone !== undefined ? { timezone: updates.timezone } : {}),
        },
      }));
    } catch (err) {
      console.error('Failed to update user:', err);
      setError(err instanceof Error ? err.message : 'Failed to update user');
    }
  }, []);

  const addNote = useCallback(async (): Promise<Note | null> => {
    try {
      const apiNote = await notesApi.create();
      const newNote = mapApiNoteToFrontend(apiNote);
      setData((d) => ({ ...d, notes: [...d.notes, newNote] }));
      return newNote;
    } catch (err) {
      console.error('Failed to add note:', err);
      setError(err instanceof Error ? err.message : 'Failed to add note');
      return null;
    }
  }, []);

  const updateNote = useCallback(async (id: EntityId, updates: Partial<Note>) => {
    try {
      const apiNote = await notesApi.update(id, updates);
      const updatedNote = mapApiNoteToFrontend(apiNote);
      setData((d) => ({ ...d, notes: d.notes.map((n) => n.id === id ? updatedNote : n) }));
    } catch (err) {
      console.error('Failed to update note:', err);
      setError(err instanceof Error ? err.message : 'Failed to update note');
    }
  }, []);

  const deleteNote = useCallback(async (id: EntityId) => {
    try {
      await notesApi.delete(id);
      setData((d) => ({ ...d, notes: d.notes.filter((n) => n.id !== id) }));
    } catch (err) {
      console.error('Failed to delete note:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete note');
    }
  }, []);

  const addEvent = useCallback(async (event: Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>): Promise<CalendarEvent | null> => {
    try {
      const apiEvent = await eventsApi.create({
        title: event.title,
        description: event.description,
        date: event.date,
        start_time: event.startTime,
        end_time: event.endTime,
        color: event.color,
      });
      const newEvent = mapApiEventToFrontend(apiEvent);
      setData((d) => ({ ...d, events: [...d.events, newEvent] }));
      return newEvent;
    } catch (err) {
      console.error('Failed to add event:', err);
      setError(err instanceof Error ? err.message : 'Failed to add event');
      return null;
    }
  }, []);

  const updateEvent = useCallback(async (id: EntityId, updates: Partial<CalendarEvent>) => {
    try {
      const apiUpdates: Record<string, unknown> = {};
      if (updates.title !== undefined) apiUpdates.title = updates.title;
      if (updates.description !== undefined) apiUpdates.description = updates.description;
      if (updates.date !== undefined) apiUpdates.date = updates.date;
      if (updates.startTime !== undefined) apiUpdates.start_time = updates.startTime;
      if (updates.endTime !== undefined) apiUpdates.end_time = updates.endTime;
      if (updates.color !== undefined) apiUpdates.color = updates.color;

      const apiEvent = await eventsApi.update(id, apiUpdates);
      const updatedEvent = mapApiEventToFrontend(apiEvent);
      setData((d) => ({ ...d, events: d.events.map((e) => e.id === id ? updatedEvent : e) }));
    } catch (err) {
      console.error('Failed to update event:', err);
      setError(err instanceof Error ? err.message : 'Failed to update event');
    }
  }, []);

  const deleteEvent = useCallback(async (id: EntityId) => {
    try {
      await eventsApi.delete(id);
      setData((d) => ({ ...d, events: d.events.filter((e) => e.id !== id) }));
    } catch (err) {
      console.error('Failed to delete event:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete event');
    }
  }, []);

  const updateSettings = useCallback(async (updates: Partial<Settings>): Promise<boolean> => {
    // Apply optimistically so toggles flip instantly, then reconcile with the
    // authoritative server response (or roll back if the request fails).
    // Resolves true/false so callers (e.g. the Settings save button) can show
    // an accurate success/failure status instead of assuming success.
    const previous = dataRef.current.settings;
    setData((d) => ({ ...d, settings: { ...d.settings, ...updates } }));
    try {
      const newSettings = await settingsApi.updateSettings(updates);
      setData((d) => ({ ...d, settings: newSettings }));
      return true;
    } catch (err) {
      setData((d) => ({ ...d, settings: previous }));
      console.error('Failed to update settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to update settings');
      return false;
    }
  }, []);

  const resetData = useCallback(() => {
    // For API version, just clear local state
    setData(emptyState());
    saveAuthToken(null);
    seenNotificationKeys.current = new Set();
  }, []);

  // ==================== Real-time (WebSocket) helpers ====================
  // Apply changes broadcast by the backend. Upserts are idempotent, so it is
  // harmless when the broadcast echoes an action this client just performed.

  const applyExternalTask = useCallback((apiTask: ApiTask) => {
    const task = mapApiTaskToFrontend(apiTask);
    setData((d) => {
      const exists = d.tasks.some((t) => t.id === task.id);
      return {
        ...d,
        tasks: exists ? d.tasks.map((t) => (t.id === task.id ? task : t)) : [task, ...d.tasks],
      };
    });
  }, []);

  const removeExternalTask = useCallback((id: EntityId) => {
    setData((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== id) }));
  }, []);

  const applyExternalNote = useCallback((apiNote: ApiNote) => {
    const note = mapApiNoteToFrontend(apiNote);
    setData((d) => {
      const exists = d.notes.some((n) => n.id === note.id);
      return {
        ...d,
        notes: exists ? d.notes.map((n) => (n.id === note.id ? note : n)) : [note, ...d.notes],
      };
    });
  }, []);

  const applyExternalEvent = useCallback((apiEvent: ApiEvent) => {
    const event = mapApiEventToFrontend(apiEvent);
    setData((d) => {
      const exists = d.events.some((e) => e.id === event.id);
      return {
        ...d,
        events: exists ? d.events.map((e) => (e.id === event.id ? event : e)) : [...d.events, event],
      };
    });
  }, []);

  const applyExternalNotification = useCallback((apiNotification: ApiNotification) => {
    const notification = mapApiNotificationToFrontend(apiNotification);
    // Consume the dedup key so this device's own reminder scheduler does not
    // recreate a notification another device (or the server) already created.
    if (notification.dedupKey) {
      seenNotificationKeys.current.add(notification.dedupKey);
      const userId = dataRef.current.user?.id;
      if (userId) {
        persistConsumedKeys(userId, seenNotificationKeys.current);
      }
    }
    setData((d) => {
      const exists = d.notifications.some((n) => n.id === notification.id);
      return {
        ...d,
        notifications: exists
          ? d.notifications.map((n) => (n.id === notification.id ? notification : n))
          : [...d.notifications, notification],
      };
    });
  }, []);

  const refreshCollection = useCallback(async (collection: 'lists' | 'tags' | 'notes' | 'events') => {
    try {
      switch (collection) {
        case 'lists': {
          const response = await listsApi.getAll();
          const lists = normalizeCollection<ApiList>(response).map(mapApiListToFrontend);
          setData((d) => ({ ...d, lists }));
          break;
        }
        case 'tags': {
          const response = await tagsApi.getAll();
          const tags = normalizeCollection<ApiTag>(response).map(mapApiTagToFrontend);
          setData((d) => ({ ...d, tags }));
          break;
        }
        case 'notes': {
          const response = await notesApi.getAll();
          const notes = normalizeCollection<ApiNote>(response).map(mapApiNoteToFrontend);
          setData((d) => ({ ...d, notes }));
          break;
        }
        case 'events': {
          const response = await eventsApi.getAll();
          const events = normalizeCollection<ApiEvent>(response).map(mapApiEventToFrontend);
          setData((d) => ({ ...d, events }));
          break;
        }
      }
    } catch (err) {
      console.error(`Failed to refresh ${collection}:`, err);
    }
  }, []);

  return {
    data,
    loading,
    authPending,
    error,
    clearError,
    signUp,
    signIn,
    signOut,
    changePassword,
    deleteAccount,
    addTask,
    updateTask,
    deleteTask,
    toggleTask,
    addSubtask,
    toggleSubtask,
    editSubtask,
    deleteSubtask,
    addList,
    updateList,
    deleteList,
    addTag,
    updateTag,
    deleteTag,
    updateUser,
    addNote,
    updateNote,
    deleteNote,
    addEvent,
    updateEvent,
    deleteEvent,
    clearNotifications,
    markAllNotificationsRead,
    updateSettings,
    resetData,
    applyExternalTask,
    removeExternalTask,
    applyExternalNote,
    applyExternalEvent,
    applyExternalNotification,
    refreshCollection,
  };
}

export type Store = ReturnType<typeof useAppStore>;

// ==================== Mapping Functions ====================
// Convert API responses to frontend types

function mapApiUserToFrontend(apiUser: ApiUser): User {
  return {
    id: apiUser.id,
    username: apiUser.username,
    name: `${apiUser.first_name} ${apiUser.last_name}`.trim() || apiUser.username,
    email: apiUser.email,
    password: '', // Password is not returned from API
    bio: apiUser.bio,
    timezone: apiUser.timezone,
    first_name: apiUser.first_name,
    last_name: apiUser.last_name,
    date_format: apiUser.date_format,
    start_of_week: apiUser.start_of_week,
    time_format: apiUser.time_format,
    push_notifications: apiUser.push_notifications,
    task_reminders: apiUser.task_reminders,
  };
}

function mapApiListToFrontend(apiList: ApiList): ListItem {
  return {
    id: apiList.id,
    label: apiList.label,
    color: apiList.color,
    createdAt: apiList.created_at,
    updatedAt: apiList.updated_at,
  };
}

function mapApiTagToFrontend(apiTag: ApiTag): TagItem {
  return {
    id: apiTag.id,
    label: apiTag.label,
    color: apiTag.color,
    createdAt: apiTag.created_at,
    updatedAt: apiTag.updated_at,
  };
}

function mapApiTaskToFrontend(apiTask: ApiTask): Task {
  return {
    id: apiTask.id,
    title: apiTask.title,
    description: apiTask.description,
    completed: apiTask.completed,
    priority: apiTask.priority,
    color: apiTask.color,
    dueDate: apiTask.due_date,
    listId: apiTask.list_id,
    tagIds: apiTask.tag_ids ?? [],
    subtasks: apiTask.subtasks.map(mapApiSubtaskToFrontend),
    createdAt: apiTask.created_at,
    updatedAt: apiTask.updated_at,
  };
}

function mapApiSubtaskToFrontend(apiSubtask: ApiSubtask): Subtask {
  return {
    id: apiSubtask.id,
    title: apiSubtask.title,
    completed: apiSubtask.completed,
    createdAt: apiSubtask.created_at,
  };
}

function mapApiNoteToFrontend(apiNote: ApiNote): Note {
  return {
    id: apiNote.id,
    title: apiNote.title,
    body: apiNote.body,
    color: apiNote.color,
    createdAt: apiNote.created_at,
    updatedAt: apiNote.updated_at,
  };
}

function mapApiEventToFrontend(apiEvent: ApiEvent): CalendarEvent {
  return {
    id: apiEvent.id,
    title: apiEvent.title,
    description: apiEvent.description,
    date: apiEvent.date,
    startTime: apiEvent.start_time,
    endTime: apiEvent.end_time,
    color: apiEvent.color,
    createdAt: apiEvent.created_at,
    updatedAt: apiEvent.updated_at,
  };
}

function mapApiNotificationToFrontend(apiNotification: ApiNotification): Notification {
  return {
    id: apiNotification.id,
    message: apiNotification.message,
    timestamp: apiNotification.created_at,
    read: apiNotification.read,
    dedupKey: apiNotification.dedup_key,
  };
}
