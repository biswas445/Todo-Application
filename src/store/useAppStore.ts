import { useState, useCallback, useEffect, useRef } from 'react';
import type { AppData, Task, ListItem, TagItem, Note, CalendarEvent, Settings, User, TaskColor, EntityId } from '@/types';
export type { AppData, Task, ListItem, TagItem, Note, CalendarEvent, Settings, User, TaskColor, EntityId };
import { defaultData, listColors, tagColors, uid } from './mockData';

const STORAGE_KEY = 'organic-mind-state-v1';

function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppData>;
      if (parsed && Array.isArray(parsed.tasks)) {
        const defaults = defaultData();
        const settings = { ...defaults.settings, ...parsed.settings };
        const { theme: _t, accentColor: _a, emailDigest: _e, ...cleanSettings } = settings as Record<string, unknown>;
        void _t; void _a; void _e;
        return {
          tasks: (parsed.tasks ?? []).map((t) => ({ ...t, subtasks: (t.subtasks ?? []).map((s) => ({ ...s, createdAt: s.createdAt ?? nowISO() })) })),
          lists: parsed.lists ?? [],
          tags: parsed.tags ?? [],
          notes: parsed.notes ?? [],
          events: parsed.events ?? [],
          user: parsed.user ?? null,
          settings: cleanSettings as Settings,
          session: parsed.session ?? false,
        };
      }
    }
  } catch { /* corrupt — fall through to defaults */ }
  return defaultData();
}

function saveData(data: AppData) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* storage unavailable */ }
}

const nowISO = () => new Date().toISOString();

export function useAppStore() {
  const [data, setData] = useState<AppData>(loadData);
  const firstRender = useRef(true);
  useEffect(() => { if (firstRender.current) { firstRender.current = false; return; } saveData(data); }, [data]);

  const signUp = useCallback((name: string, email: string, password: string): { ok: boolean; error?: string } => {
    if (!name.trim() || !email.trim() || !password.trim()) return { ok: false, error: 'All fields are required.' };
    if (password.length < 6) return { ok: false, error: 'Password must be at least 6 characters.' };
    let conflict = false;
    setData((d) => {
      if (d.user && d.user.email.toLowerCase() === email.trim().toLowerCase()) { conflict = true; return d; }
      return d;
    });
    if (conflict) return { ok: false, error: 'An account with this email already exists.' };
    const user: User = { id: uid(), name: name.trim(), email: email.trim(), password, bio: '', timezone: 'UTC' };
    setData((d) => ({ ...d, user, settings: { ...d.settings, displayName: name.trim(), email: email.trim() } }));
    return { ok: true };
  }, []);

  const signIn = useCallback((email: string, password: string): { ok: boolean; error?: string } => {
    if (!email.trim() || !password.trim()) return { ok: false, error: 'Email and password are required.' };
    const u = data.user;
    if (!u || u.email.toLowerCase() !== email.trim().toLowerCase() || u.password !== password) return { ok: false, error: 'Invalid email or password.' };
    setData((d) => ({ ...d, session: true }));
    return { ok: true };
  }, [data.user]);

  const signOut = useCallback(() => setData((d) => ({ ...d, session: false })), []);

  const changePassword = useCallback((current: string, next: string): { ok: boolean; error?: string } => {
    if (!data.user || data.user.password !== current) return { ok: false, error: 'Current password is incorrect.' };
    if (next.length < 6) return { ok: false, error: 'New password must be at least 6 characters.' };
    setData((d) => ({ ...d, user: d.user ? { ...d.user, password: next } : d.user }));
    return { ok: true };
  }, [data.user]);

  const addTask = useCallback((task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Task => {
    const t: Task = { ...task, id: uid(), createdAt: nowISO(), updatedAt: nowISO() };
    setData((d) => ({ ...d, tasks: [t, ...d.tasks] }));
    return t;
  }, []);

  const updateTask = useCallback((id: EntityId, updates: Partial<Task>) => {
    setData((d) => ({ ...d, tasks: d.tasks.map((t) => t.id === id ? { ...t, ...updates, updatedAt: nowISO() } : t) }));
  }, []);

  const deleteTask = useCallback((id: EntityId) => {
    setData((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== id) }));
  }, []);

  const toggleTask = useCallback((id: EntityId) => {
    setData((d) => ({ ...d, tasks: d.tasks.map((t) => t.id === id ? { ...t, completed: !t.completed, updatedAt: nowISO() } : t) }));
  }, []);

  const addSubtask = useCallback((taskId: EntityId, title: string) => {
    setData((d) => ({ ...d, tasks: d.tasks.map((t) => t.id === taskId ? { ...t, subtasks: [...t.subtasks, { id: uid(), title, completed: false, createdAt: nowISO() }], updatedAt: nowISO() } : t) }));
  }, []);

  const toggleSubtask = useCallback((taskId: EntityId, subId: EntityId) => {
    setData((d) => ({ ...d, tasks: d.tasks.map((t) => t.id === taskId ? { ...t, subtasks: t.subtasks.map((s) => s.id === subId ? { ...s, completed: !s.completed } : s), updatedAt: nowISO() } : t) }));
  }, []);

  const editSubtask = useCallback((taskId: EntityId, subId: EntityId, title: string) => {
    setData((d) => ({ ...d, tasks: d.tasks.map((t) => t.id === taskId ? { ...t, subtasks: t.subtasks.map((s) => s.id === subId ? { ...s, title } : s), updatedAt: nowISO() } : t) }));
  }, []);

  const deleteSubtask = useCallback((taskId: EntityId, subId: EntityId) => {
    setData((d) => ({ ...d, tasks: d.tasks.map((t) => t.id === taskId ? { ...t, subtasks: t.subtasks.filter((s) => s.id !== subId), updatedAt: nowISO() } : t) }));
  }, []);

  const addList = useCallback((label: string, color?: TaskColor): ListItem => {
    const c = color || listColors[data.lists.length % listColors.length];
    const item: ListItem = { id: uid(), label, color: c, createdAt: nowISO(), updatedAt: nowISO() };
    setData((d) => ({ ...d, lists: [...d.lists, item] }));
    return item;
  }, [data.lists.length]);

  const updateList = useCallback((id: EntityId, updates: Partial<ListItem>) => {
    setData((d) => ({ ...d, lists: d.lists.map((l) => l.id === id ? { ...l, ...updates, updatedAt: nowISO() } : l) }));
  }, []);

  const deleteList = useCallback((id: EntityId) => {
    setData((d) => ({ ...d, lists: d.lists.filter((l) => l.id !== id), tasks: d.tasks.map((t) => t.listId === id ? { ...t, listId: null } : t) }));
  }, []);

  const addTag = useCallback((label: string, color?: TaskColor): TagItem => {
    const c = color || tagColors[data.tags.length % tagColors.length];
    const item: TagItem = { id: uid(), label, color: c, createdAt: nowISO(), updatedAt: nowISO() };
    setData((d) => ({ ...d, tags: [...d.tags, item] }));
    return item;
  }, [data.tags.length]);

  const updateTag = useCallback((id: EntityId, updates: Partial<TagItem>) => {
    setData((d) => ({ ...d, tags: d.tags.map((t) => t.id === id ? { ...t, ...updates, updatedAt: nowISO() } : t) }));
  }, []);

  const deleteTag = useCallback((id: EntityId) => {
    setData((d) => ({ ...d, tags: d.tags.filter((t) => t.id !== id), tasks: d.tasks.map((t) => ({ ...t, tagIds: t.tagIds.filter((tid) => tid !== id) })) }));
  }, []);

  const updateUser = useCallback((updates: Partial<User>) => {
    setData((d) => ({ ...d, user: d.user ? { ...d.user, ...updates } : d.user, settings: { ...d.settings, ...(updates.name !== undefined ? { displayName: updates.name } : {}), ...(updates.email !== undefined ? { email: updates.email } : {}), ...(updates.bio !== undefined ? { bio: updates.bio } : {}), ...(updates.timezone !== undefined ? { timezone: updates.timezone } : {}) } }));
  }, []);

  const addNote = useCallback((): Note => {
    const note: Note = { id: uid(), title: 'New note', body: 'Write something down...', color: 'note-yellow', createdAt: nowISO(), updatedAt: nowISO() };
    setData((d) => ({ ...d, notes: [...d.notes, note] }));
    return note;
  }, []);

  const updateNote = useCallback((id: EntityId, updates: Partial<Note>) => {
    setData((d) => ({ ...d, notes: d.notes.map((n) => n.id === id ? { ...n, ...updates, updatedAt: nowISO() } : n) }));
  }, []);

  const deleteNote = useCallback((id: EntityId) => {
    setData((d) => ({ ...d, notes: d.notes.filter((n) => n.id !== id) }));
  }, []);

  const addEvent = useCallback((event: Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>): CalendarEvent => {
    const ev: CalendarEvent = { ...event, id: uid(), createdAt: nowISO(), updatedAt: nowISO() };
    setData((d) => ({ ...d, events: [...d.events, ev] }));
    return ev;
  }, []);

  const updateEvent = useCallback((id: EntityId, updates: Partial<CalendarEvent>) => {
    setData((d) => ({ ...d, events: d.events.map((e) => e.id === id ? { ...e, ...updates, updatedAt: nowISO() } : e) }));
  }, []);

  const deleteEvent = useCallback((id: EntityId) => {
    setData((d) => ({ ...d, events: d.events.filter((e) => e.id !== id) }));
  }, []);

  const updateSettings = useCallback((updates: Partial<Settings>) => {
    setData((d) => ({ ...d, settings: { ...d.settings, ...updates } }));
  }, []);

  const deleteAccount = useCallback((password: string): { ok: boolean; error?: string } => {
    if (!data.user) return { ok: false, error: 'No user logged in.' };
    if (data.user.password !== password) return { ok: false, error: 'Incorrect password.' };
    // Clear all data and reset to defaults
    const fresh = defaultData();
    setData({ ...fresh, session: false, user: null });
    return { ok: true };
  }, [data.user]);

  const resetData = useCallback(() => {
    const fresh = defaultData();
    setData({ ...fresh, session: false });
  }, []);

  return {
    data, signUp, signIn, signOut, changePassword, deleteAccount,
    addTask, updateTask, deleteTask, toggleTask, addSubtask, toggleSubtask, editSubtask, deleteSubtask,
    addList, updateList, deleteList, addTag, updateTag, deleteTag, updateUser,
    addNote, updateNote, deleteNote,
    addEvent, updateEvent, deleteEvent,
    updateSettings, resetData,
  };
}

export type Store = ReturnType<typeof useAppStore>;
