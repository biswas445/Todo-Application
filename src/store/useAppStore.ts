import { useState, useCallback, useEffect, useRef } from 'react';
import type { AppData, Task, ListItem, TagItem, Note, CalendarEvent, Settings, User, TaskColor, EntityId } from '@/types';
export type { AppData, Task, ListItem, TagItem, Note, CalendarEvent, Settings, User, TaskColor, EntityId };
import { 
  authApi, listsApi, tagsApi, tasksApi, notesApi, eventsApi, settingsApi,
  ApiError 
} from '@/api';

const STORAGE_KEY = 'organic-mind-state-v1';
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

const nowISO = () => new Date().toISOString();


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
      taskReminders: false,
    },
    session: false,
  };
}

export function useAppStore() {
  const [data, setData] = useState<AppData>(emptyState());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

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
        // Fetch all data in parallel
        const [user, listsResponse, tagsResponse, tasksResponse, notesResponse, eventsResponse] = await Promise.all([
          authApi.getMe().catch(() => null),
          listsApi.getAll(),
          tagsApi.getAll(),
          tasksApi.getAll(),
          notesApi.getAll(),
          eventsApi.getAll(),
        ]);

        // Normalize all collections to arrays
        const lists = normalizeCollection<ListItem>(listsResponse);
        const tags = normalizeCollection<TagItem>(tagsResponse);
        const tasks = normalizeCollection<Task>(tasksResponse);
        const notes = normalizeCollection<Note>(notesResponse);
        const events = normalizeCollection<CalendarEvent>(eventsResponse);

        if (user) {
          const settings = await settingsApi.getSettings().catch(() => ({
            displayName: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username,
            email: user.email,
            timezone: user.timezone || 'UTC',
            bio: user.bio || '',
            language: 'English (US)',
            dateFormat: user.date_format || 'DD-MM-YY',
            startOfWeek: user.start_of_week || 'Monday',
            timeFormat: user.time_format || '12-hour',
            pushNotifications: user.push_notifications ?? true,
            taskReminders: user.task_reminders ?? false,
          }));

          setData({
            tasks: tasks.map(mapApiTaskToFrontend),
            lists: lists.map(mapApiListToFrontend),
            tags: tags.map(mapApiTagToFrontend),
            notes: notes.map(mapApiNoteToFrontend),
            events: events.map(mapApiEventToFrontend),
            notifications: [],
            user: mapApiUserToFrontend(user),
            settings,
            session: true,
          });
        } else {
          saveAuthToken(null);
          setData(emptyState());
        }
      } catch (err) {
        console.error('Failed to initialize app data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
        saveAuthToken(null);
        setData(emptyState());
      } finally {
        setLoading(false);
        initialized.current = true;
      }
    }

    init();
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string): Promise<{ ok: boolean; error?: string }> => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      return { ok: false, error: 'All fields are required.' };
    }
    if (password.length < 6) {
      return { ok: false, error: 'Password must be at least 6 characters.' };
    }

    try {
      setLoading(true);
      const response = await authApi.register({
        username: email.trim(),
        email: email.trim(),
        password,
        first_name: name.trim().split(' ')[0],
        last_name: name.trim().split(' ').slice(1).join(' '),
      });

      saveAuthToken(response.token);

      // For new signup, initialize with empty arrays (no need to fetch since user is new)
      const settings = await settingsApi.getSettings().catch(() => ({
        displayName: name.trim(),
        email: email.trim(),
        timezone: 'UTC',
        bio: '',
        language: 'English (US)',
        dateFormat: 'DD-MM-YY',
        startOfWeek: 'Monday',
        timeFormat: '12-hour',
        pushNotifications: true,
        taskReminders: false,
      }));

      setData({
        tasks: [],
        lists: [],
        tags: [],
        notes: [],
        events: [],
        user: mapApiUserToFrontend(response.user),
        settings,
        session: true,
      });
      return { ok: true };
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Registration failed';
      return { ok: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<{ ok: boolean; error?: string }> => {
    if (!email.trim() || !password.trim()) {
      return { ok: false, error: 'Email and password are required.' };
    }

    try {
      setLoading(true);
      const response = await authApi.login({ email: email.trim(), password });
      saveAuthToken(response.token);

      const [listsResponse, tagsResponse, tasksResponse, notesResponse, eventsResponse] = await Promise.all([
        listsApi.getAll(),
        tagsApi.getAll(),
        tasksApi.getAll(),
        notesApi.getAll(),
        eventsApi.getAll(),
      ]);

      // Normalize all collections to arrays
      const lists = normalizeCollection<ListItem>(listsResponse);
      const tags = normalizeCollection<TagItem>(tagsResponse);
      const tasks = normalizeCollection<Task>(tasksResponse);
      const notes = normalizeCollection<Note>(notesResponse);
      const events = normalizeCollection<CalendarEvent>(eventsResponse);

      const settings = await settingsApi.getSettings().catch(() => ({
        displayName: `${response.user.first_name || ''} ${response.user.last_name || ''}`.trim() || response.user.username,
        email: response.user.email,
        timezone: response.user.timezone || 'UTC',
        bio: response.user.bio || '',
        language: 'English (US)',
        dateFormat: response.user.date_format || 'DD-MM-YY',
        startOfWeek: response.user.start_of_week || 'Monday',
        timeFormat: response.user.time_format || '12-hour',
        pushNotifications: response.user.push_notifications ?? true,
        taskReminders: response.user.task_reminders ?? false,
      }));

      setData({
        tasks: tasks.map(mapApiTaskToFrontend),
        lists: lists.map(mapApiListToFrontend),
        tags: tags.map(mapApiTagToFrontend),
        notes: notes.map(mapApiNoteToFrontend),
        events: events.map(mapApiEventToFrontend),
        notifications: [],
        user: mapApiUserToFrontend(response.user),
        settings,
        session: true,
      });
      return { ok: true };
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Login failed';
      return { ok: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout().catch(() => {});
    } finally {
      saveAuthToken(null);
      setData(emptyState());
    }
  }, []);

  const changePassword = useCallback(async (current: string, next: string): Promise<{ ok: boolean; error?: string }> => {
    if (next.length < 6) {
      return { ok: false, error: 'New password must be at least 6 characters.' };
    }
    try {
      setLoading(true);
      await authApi.changePassword(current, next);
      return { ok: true };
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Password change failed';
      return { ok: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteAccount = useCallback(async (password: string): Promise<{ ok: boolean; error?: string }> => {
    if (!data.user) {
      return { ok: false, error: 'No user logged in.' };
    }
    try {
      setLoading(true);
      await authApi.deleteAccount(password);
      saveAuthToken(null);
      setData(emptyState());
      return { ok: true };
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Account deletion failed';
      return { ok: false, error: message };
    } finally {
      setLoading(false);
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

  const toggleTask = useCallback(async (id: EntityId) => {
    try {
      const apiTask = await tasksApi.toggle(id);
      const updatedTask = mapApiTaskToFrontend(apiTask);
      setData((d) => ({ ...d, tasks: d.tasks.map((t) => t.id === id ? updatedTask : t) }));
    } catch (err) {
      console.error('Failed to toggle task:', err);
      setError(err instanceof Error ? err.message : 'Failed to toggle task');
    }
  }, []);

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
      const apiSubtask = await tasksApi.updateSubtask(taskId, subId, title);
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
  }, [data.user]);

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

  const updateSettings = useCallback(async (updates: Partial<Settings>) => {
    try {
      const newSettings = await settingsApi.updateSettings(updates);
      setData((d) => ({ ...d, settings: newSettings }));
    } catch (err) {
      console.error('Failed to update settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to update settings');
    }
  }, []);

  const resetData = useCallback(() => {
    // For API version, just clear local state
    setData(emptyState());
    saveAuthToken(null);
  }, []);

  return {
    data,
    loading,
    error,
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
    updateSettings,
    resetData,
  };
}

export type Store = ReturnType<typeof useAppStore>;

// ==================== Mapping Functions ====================
// Convert API responses to frontend types

function mapApiUserToFrontend(apiUser: {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  bio: string;
  timezone: string;
}): User {
  return {
    id: apiUser.id,
    name: `${apiUser.first_name} ${apiUser.last_name}`.trim() || apiUser.username,
    email: apiUser.email,
    password: '', // Password is not returned from API
    bio: apiUser.bio,
    timezone: apiUser.timezone,
  };
}

function mapApiListToFrontend(apiList: {
  id: string;
  label: string;
  color: TaskColor;
  created_at: string;
  updated_at: string;
}): ListItem {
  return {
    id: apiList.id,
    label: apiList.label,
    color: apiList.color,
    createdAt: apiList.created_at,
    updatedAt: apiList.updated_at,
  };
}

function mapApiTagToFrontend(apiTag: {
  id: string;
  label: string;
  color: TaskColor;
  created_at: string;
  updated_at: string;
}): TagItem {
  return {
    id: apiTag.id,
    label: apiTag.label,
    color: apiTag.color,
    createdAt: apiTag.created_at,
    updatedAt: apiTag.updated_at,
  };
}

function mapApiTaskToFrontend(apiTask: {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  priority: string;
  color: TaskColor | null;
  due_date: string | null;
  list_id: string | null;
  subtasks: Array<{ id: string; title: string; completed: boolean; created_at: string }>;
  created_at: string;
  updated_at: string;
}): Task {
  return {
    id: apiTask.id,
    title: apiTask.title,
    description: apiTask.description,
    completed: apiTask.completed,
    priority: apiTask.priority as 'Low' | 'Normal' | 'High',
    color: apiTask.color,
    dueDate: apiTask.due_date,
    listId: apiTask.list_id,
    tagIds: [], // Tags are handled separately in the full implementation
    subtasks: apiTask.subtasks.map(mapApiSubtaskToFrontend),
    createdAt: apiTask.created_at,
    updatedAt: apiTask.updated_at,
  };
}

function mapApiSubtaskToFrontend(apiSubtask: {
  id: string;
  title: string;
  completed: boolean;
  created_at: string;
}): { id: string; title: string; completed: boolean; createdAt: string } {
  return {
    id: apiSubtask.id,
    title: apiSubtask.title,
    completed: apiSubtask.completed,
    createdAt: apiSubtask.created_at,
  };
}

function mapApiNoteToFrontend(apiNote: {
  id: string;
  title: string;
  body: string;
  color: string;
  created_at: string;
  updated_at: string;
}): Note {
  return {
    id: apiNote.id,
    title: apiNote.title,
    body: apiNote.body,
    color: apiNote.color as NoteColor,
    createdAt: apiNote.created_at,
    updatedAt: apiNote.updated_at,
  };
}

function mapApiEventToFrontend(apiEvent: {
  id: string;
  title: string;
  description: string;
  date: string;
  start_time: string;
  end_time: string;
  color: TaskColor;
  created_at: string;
  updated_at: string;
}): CalendarEvent {
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
