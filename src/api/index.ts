import type {
  Settings, EntityId, Priority, TaskColor, NoteColor
} from '@/types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';

// ==================== Raw API response shapes ====================
// These mirror the Django serializers (snake_case). The store maps them to
// frontend models via its mapApi*ToFrontend functions.

export interface ApiUser {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  bio: string;
  timezone: string;
  date_format?: string;
  start_of_week?: string;
  time_format?: string;
  push_notifications?: boolean;
  task_reminders?: boolean;
}

export interface ApiSubtask {
  id: string;
  title: string;
  completed: boolean;
  created_at: string;
}

export interface ApiTask {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  priority: Priority;
  color: TaskColor | null;
  due_date: string | null;
  list: EntityId | null;
  list_id: EntityId | null;
  tag_ids: EntityId[];
  subtasks: ApiSubtask[];
  created_at: string;
  updated_at: string;
}

export interface ApiList {
  id: string;
  label: string;
  color: TaskColor;
  created_at: string;
  updated_at: string;
  task_count?: number;
}

export interface ApiTag {
  id: string;
  label: string;
  color: TaskColor;
  created_at: string;
  updated_at: string;
  task_count?: number;
}

export interface ApiNote {
  id: string;
  title: string;
  body: string;
  color: NoteColor;
  created_at: string;
  updated_at: string;
}

export interface ApiEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  start_time: string;
  end_time: string;
  color: TaskColor;
  created_at: string;
  updated_at: string;
}

// Helper to get auth token from localStorage
function getAuthToken(): string | null {
  return localStorage.getItem('auth_token');
}

// ==================== Global 401 (unauthorized) handling ====================
// When an authenticated request is rejected with 401 the stored token is no
// longer valid (expired, rotated on another login, or revoked by a password
// change). The API layer is decoupled from the store, so it exposes a single
// hook the store registers on mount; any 401 mid-session then signs the user
// out globally instead of leaving a broken "signed in" UI.
type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setOnUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

// Invoked by apiRequest when the server rejects the current credentials.
export function notifyUnauthorized(): void {
  unauthorizedHandler?.();
}

// Only idempotent methods are safe to retry: a POST/PATCH/DELETE that timed
// out after the server already applied it would be duplicated on retry.
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// DRF reports validation failures as per-field message arrays (e.g.
// { email: ['A user with this email already exists.'] }) rather than a single
// top-level message. Flatten any string messages so the UI can show the real
// reason instead of a generic fallback.
function extractErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback;
  const record = data as Record<string, unknown>;
  if (typeof record.error === 'string') return record.error;
  if (typeof record.detail === 'string') return record.detail;
  const parts: string[] = [];
  for (const value of Object.values(record)) {
    if (typeof value === 'string') {
      parts.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') parts.push(item);
      }
    }
  }
  return parts.length > 0 ? parts.join(' ') : fallback;
}

// Helper to make authenticated API calls with retry logic
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  maxRetries = 3
): Promise<T> {
  const token = getAuthToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Token ${token}` } : {}),
    ...options.headers,
  };

  const method = (options.method ?? 'GET').toUpperCase();
  const retryable = IDEMPOTENT_METHODS.has(method);
  // Non-idempotent requests get a single attempt: surface 5xx/network errors
  // immediately instead of risking duplicate side effects.
  const effectiveRetries = retryable ? maxRetries : 0;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= effectiveRetries; attempt++) {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Don't retry client errors (4xx) - these are authentication/validation issues
        if (response.status >= 400 && response.status < 500) {
          // A 401 on a request that actually carried the token means the
          // session was invalidated server-side. Credential endpoints that
          // have no token yet (login/register) must not trigger a sign-out,
          // so this only fires when a token was sent.
          if (response.status === 401 && token) {
            notifyUnauthorized();
          }
          throw new ApiError(
            extractErrorMessage(errorData, 'Request failed'),
            response.status
          );
        }

        // For server errors (5xx), retry idempotent requests with exponential backoff
        if (attempt === effectiveRetries) {
          throw new ApiError(
            extractErrorMessage(errorData, 'Server error after retries'),
            response.status
          );
        }

        lastError = new ApiError(
          extractErrorMessage(errorData, 'Server error, retrying...'),
          response.status
        );

        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return undefined as T;
      }

      return response.json();
    } catch (error) {
      // If it's already an ApiError, rethrow it
      if (error instanceof ApiError) {
        throw error;
      }

      // Network errors - retry only idempotent requests
      lastError = error as Error;
      if (attempt === effectiveRetries) {
        throw lastError;
      }

      // Exponential backoff for network errors
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Request failed');
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ==================== Pagination helpers ====================
// The backend paginates list endpoints (PAGE_SIZE=100). Reading only the
// first page would silently truncate collections larger than the page size,
// so every getAll follows the `next` links until the collection is complete.

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

function extractPageNumber(url: string | null): number | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, 'http://localhost');
    const page = parsed.searchParams.get('page');
    const value = page ? Number(page) : NaN;
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

async function fetchAllPages<T>(endpoint: string): Promise<T[]> {
  const separator = endpoint.includes('?') ? '&' : '?';
  let path = endpoint;
  const all: T[] = [];

  for (let page = 1; ; page++) {
    const response = await apiRequest<T[] | PaginatedResponse<T>>(path);

    // Endpoint returned a plain array (no pagination) - we're done.
    if (Array.isArray(response)) {
      return all.concat(response);
    }
    // Unexpected shape (no results array): stop instead of crashing, the
    // store's normalizeCollection treats such responses as empty too.
    if (!response || !Array.isArray(response.results)) {
      return all;
    }

    all.push(...response.results);

    const nextPage = extractPageNumber(response.next);
    if (nextPage === null || nextPage <= page) {
      return all;
    }
    path = `${endpoint}${separator}page=${nextPage}`;
  }
}

// ==================== Auth API ====================

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: ApiUser;
}

export interface RegisterResponse {
  message: string;
  user: ApiUser;
}

export const authApi = {
  async register(payload: RegisterPayload): Promise<RegisterResponse> {
    const response = await apiRequest<RegisterResponse>('/auth/register/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return response;
  },

  async login(payload: LoginPayload): Promise<AuthResponse> {
    const response = await apiRequest<AuthResponse>('/auth/login/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    // Store token automatically on login
    localStorage.setItem('auth_token', response.token);
    return response;
  },

  async logout(): Promise<void> {
    await apiRequest('/auth/logout/', { method: 'POST' });
  },

  async getMe(): Promise<ApiUser> {
    return apiRequest<ApiUser>('/user/me/');
  },

  async updateProfile(updates: Partial<ApiUser>): Promise<ApiUser> {
    return apiRequest<ApiUser>('/user/update_profile/', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
    return apiRequest<{ message: string }>('/user/change_password/', {
      method: 'POST',
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: newPassword,
      }),
    });
  },

  async deleteAccount(password: string): Promise<{ message: string }> {
    return apiRequest<{ message: string }>('/user/account/', {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    });
  },
};

// ==================== Lists API ====================

export const listsApi = {
  async getAll(): Promise<ApiList[]> {
    return fetchAllPages<ApiList>('/lists/');
  },

  async create(label: string, color?: TaskColor): Promise<ApiList> {
    return apiRequest<ApiList>('/lists/', {
      method: 'POST',
      body: JSON.stringify({ label, color: color || 'coral' }),
    });
  },

  async update(id: EntityId, updates: Partial<ApiList>): Promise<ApiList> {
    return apiRequest<ApiList>(`/lists/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  async delete(id: EntityId): Promise<void> {
    await apiRequest(`/lists/${id}/`, { method: 'DELETE' });
  },
};

// ==================== Tags API ====================

export const tagsApi = {
  async getAll(): Promise<ApiTag[]> {
    return fetchAllPages<ApiTag>('/tags/');
  },

  async create(label: string, color?: TaskColor): Promise<ApiTag> {
    return apiRequest<ApiTag>('/tags/', {
      method: 'POST',
      body: JSON.stringify({ label, color: color || 'cyan' }),
    });
  },

  async update(id: EntityId, updates: Partial<ApiTag>): Promise<ApiTag> {
    return apiRequest<ApiTag>(`/tags/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  async delete(id: EntityId): Promise<void> {
    await apiRequest(`/tags/${id}/`, { method: 'DELETE' });
  },
};

// ==================== Tasks API ====================

interface TaskCreatePayload {
  title: string;
  description?: string;
  completed?: boolean;
  priority?: Priority;
  color?: TaskColor | null;
  due_date?: string | null;
  list?: EntityId | null;
  tag_ids?: EntityId[];
}

interface TaskUpdatePayload {
  title?: string;
  description?: string;
  completed?: boolean;
  priority?: Priority;
  color?: TaskColor | null;
  due_date?: string | null;
  list?: EntityId | null;
  tag_ids?: EntityId[];
}

export interface TaskQueryParams {
  search?: string;
  completed?: boolean;
  list?: EntityId;
  tags?: EntityId;
  due_date?: string;
  today?: boolean;
  upcoming?: boolean;
}

export const tasksApi = {
  async getAll(params?: TaskQueryParams): Promise<ApiTask[]> {
    const queryParams = new URLSearchParams();
    if (params?.search) queryParams.append('search', params.search);
    if (params?.completed !== undefined) queryParams.append('completed', String(params.completed));
    if (params?.list) queryParams.append('list', params.list);
    if (params?.tags) queryParams.append('tags', params.tags);
    if (params?.due_date) queryParams.append('due_date', params.due_date);
    if (params?.today) queryParams.append('today', 'true');
    if (params?.upcoming) queryParams.append('upcoming', 'true');

    const query = queryParams.toString();
    return fetchAllPages<ApiTask>(`/tasks/${query ? `?${query}` : ''}`);
  },

  async create(payload: TaskCreatePayload): Promise<ApiTask> {
    return apiRequest<ApiTask>('/tasks/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async update(id: EntityId, updates: TaskUpdatePayload): Promise<ApiTask> {
    return apiRequest<ApiTask>(`/tasks/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  async delete(id: EntityId): Promise<void> {
    await apiRequest(`/tasks/${id}/`, { method: 'DELETE' });
  },

  async toggle(id: EntityId): Promise<ApiTask> {
    return apiRequest<ApiTask>(`/tasks/${id}/toggle/`, { method: 'POST' });
  },

  async addSubtask(taskId: EntityId, title: string): Promise<ApiSubtask> {
    return apiRequest(`/tasks/${taskId}/add_subtask/`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
  },

  async toggleSubtask(taskId: EntityId, subtaskId: EntityId): Promise<ApiSubtask> {
    return apiRequest(`/tasks/${taskId}/subtasks/${subtaskId}/toggle/`, { method: 'POST' });
  },

  async updateSubtask(subtaskId: EntityId, title: string): Promise<ApiSubtask> {
    return apiRequest(`/tasks/subtasks/${subtaskId}/update/`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
  },

  async deleteSubtask(taskId: EntityId, subtaskId: EntityId): Promise<void> {
    await apiRequest(`/tasks/${taskId}/subtasks/${subtaskId}/`, { method: 'DELETE' });
  },
};

// ==================== Notes API ====================

export const notesApi = {
  async getAll(): Promise<ApiNote[]> {
    return fetchAllPages<ApiNote>('/notes/');
  },

  async create(title?: string, body?: string, color?: NoteColor): Promise<ApiNote> {
    return apiRequest<ApiNote>('/notes/', {
      method: 'POST',
      body: JSON.stringify({
        title: title || 'New note',
        body: body || 'Write something down...',
        color: color || 'note-yellow',
      }),
    });
  },

  async update(id: EntityId, updates: Partial<ApiNote>): Promise<ApiNote> {
    return apiRequest<ApiNote>(`/notes/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  async delete(id: EntityId): Promise<void> {
    await apiRequest(`/notes/${id}/`, { method: 'DELETE' });
  },
};

// ==================== Events API ====================

interface EventCreatePayload {
  title: string;
  description?: string;
  date: string;
  start_time: string;
  end_time: string;
  color?: TaskColor;
}

export const eventsApi = {
  async getAll(): Promise<ApiEvent[]> {
    return fetchAllPages<ApiEvent>('/events/');
  },

  async create(payload: EventCreatePayload): Promise<ApiEvent> {
    return apiRequest<ApiEvent>('/events/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async update(id: EntityId, updates: Partial<ApiEvent>): Promise<ApiEvent> {
    return apiRequest<ApiEvent>(`/events/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  async delete(id: EntityId): Promise<void> {
    await apiRequest(`/events/${id}/`, { method: 'DELETE' });
  },
};

// ==================== Notifications API ====================

export interface ApiNotification {
  id: string;
  message: string;
  dedup_key: string;
  read: boolean;
  created_at: string;
}

export const notificationsApi = {
  async getAll(): Promise<ApiNotification[]> {
    return fetchAllPages<ApiNotification>('/notifications/');
  },

  async create(payload: { message: string; dedup_key: string }): Promise<ApiNotification> {
    return apiRequest<ApiNotification>('/notifications/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async markRead(id: EntityId): Promise<ApiNotification> {
    return apiRequest<ApiNotification>(`/notifications/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify({ read: true }),
    });
  },

  async markAllRead(): Promise<{ message: string; updated: number }> {
    return apiRequest<{ message: string; updated: number }>(
      '/notifications/mark_all_read/',
      { method: 'POST' }
    );
  },

  async clearAll(): Promise<{ message: string; deleted: number }> {
    return apiRequest<{ message: string; deleted: number }>('/notifications/clear/', {
      method: 'DELETE',
    });
  },
};

// ==================== Settings Helpers ====================

// Settings are stored locally but synced with user profile
export const settingsApi = {
  async getSettings(): Promise<Settings> {
    const user = await authApi.getMe();
    return mapUserToSettings(user);
  },

  async updateSettings(updates: Partial<Settings>): Promise<Settings> {
    const userUpdates = mapSettingsToUserUpdates(updates);
    const user = await authApi.updateProfile(userUpdates);
    return mapUserToSettings(user);
  },
};

function mapUserToSettings(user: ApiUser): Settings {
  return {
    displayName: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username,
    email: user.email,
    timezone: user.timezone || 'UTC',
    bio: user.bio || '',
    language: 'English (US)', // Default, can be extended
    dateFormat: user.date_format || 'DD-MM-YY',
    startOfWeek: user.start_of_week || 'Monday',
    timeFormat: user.time_format || '12-hour',
    pushNotifications: user.push_notifications ?? true,
    taskReminders: user.task_reminders ?? true,
  };
}

export { mapUserToSettings };

function mapSettingsToUserUpdates(settings: Partial<Settings>): Partial<ApiUser> {
  const updates: Partial<ApiUser> = {};
  if (settings.displayName !== undefined) {
    const names = settings.displayName.split(' ');
    updates.first_name = names[0] || '';
    updates.last_name = names.slice(1).join(' ') || '';
  }
  if (settings.bio !== undefined) updates.bio = settings.bio;
  if (settings.timezone !== undefined) updates.timezone = settings.timezone;
  if (settings.dateFormat !== undefined) updates.date_format = settings.dateFormat;
  if (settings.startOfWeek !== undefined) updates.start_of_week = settings.startOfWeek;
  if (settings.timeFormat !== undefined) updates.time_format = settings.timeFormat;
  if (settings.pushNotifications !== undefined) updates.push_notifications = settings.pushNotifications;
  if (settings.taskReminders !== undefined) updates.task_reminders = settings.taskReminders;
  return updates;
}
