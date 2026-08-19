import type { 
  Task, ListItem, TagItem, Note, CalendarEvent, 
  Settings, User, EntityId, Priority, TaskColor, NoteColor 
} from '@/types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';

// Helper to get auth token from localStorage
function getAuthToken(): string | null {
  return localStorage.getItem('auth_token');
}

// Helper to make authenticated API calls
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

  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // Don't retry client errors (4xx) - these are authentication/validation issues
        if (response.status >= 400 && response.status < 500) {
          throw new ApiError(
            errorData.error || errorData.detail || 'Request failed',
            response.status
          );
        }
        
        // For server errors (5xx), retry with exponential backoff
        if (attempt === maxRetries) {
          throw new ApiError(
            errorData.error || errorData.detail || 'Server error after retries',
            response.status
          );
        }
        
        lastError = new ApiError(
          errorData.error || errorData.detail || 'Server error, retrying...',
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
      
      // Network errors - retry
      lastError = error as Error;
      if (attempt === maxRetries) {
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
  user: User;
}

export const authApi = {
  async register(payload: RegisterPayload): Promise<AuthResponse> {
    const response = await apiRequest<AuthResponse>('/auth/register/', {
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
    return response;
  },

  async logout(): Promise<void> {
    await apiRequest('/auth/logout/', { method: 'POST' });
  },

  async getMe(): Promise<User> {
    return apiRequest<User>('/user/me/');
  },

  async updateProfile(updates: Partial<User>): Promise<User> {
    return apiRequest<User>('/user/update_profile/', {
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
  async getAll(): Promise<ListItem[]> {
    return apiRequest<ListItem[]>('/lists/');
  },

  async create(label: string, color?: TaskColor): Promise<ListItem> {
    return apiRequest<ListItem>('/lists/', {
      method: 'POST',
      body: JSON.stringify({ label, color: color || 'coral' }),
    });
  },

  async update(id: EntityId, updates: Partial<ListItem>): Promise<ListItem> {
    return apiRequest<ListItem>(`/lists/${id}/`, {
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
  async getAll(): Promise<TagItem[]> {
    return apiRequest<TagItem[]>('/tags/');
  },

  async create(label: string, color?: TaskColor): Promise<TagItem> {
    return apiRequest<TagItem>('/tags/', {
      method: 'POST',
      body: JSON.stringify({ label, color: color || 'cyan' }),
    });
  },

  async update(id: EntityId, updates: Partial<TagItem>): Promise<TagItem> {
    return apiRequest<TagItem>(`/tags/${id}/`, {
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
  async getAll(params?: TaskQueryParams): Promise<Task[]> {
    const queryParams = new URLSearchParams();
    if (params?.search) queryParams.append('search', params.search);
    if (params?.completed !== undefined) queryParams.append('completed', String(params.completed));
    if (params?.list) queryParams.append('list', params.list);
    if (params?.tags) queryParams.append('tags', params.tags);
    if (params?.due_date) queryParams.append('due_date', params.due_date);
    if (params?.today) queryParams.append('today', 'true');
    if (params?.upcoming) queryParams.append('upcoming', 'true');

    const query = queryParams.toString();
    return apiRequest<Task[]>(`/tasks/${query ? `?${query}` : ''}`);
  },

  async create(payload: TaskCreatePayload): Promise<Task> {
    return apiRequest<Task>('/tasks/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async update(id: EntityId, updates: TaskUpdatePayload): Promise<Task> {
    return apiRequest<Task>(`/tasks/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  async delete(id: EntityId): Promise<void> {
    await apiRequest(`/tasks/${id}/`, { method: 'DELETE' });
  },

  async toggle(id: EntityId): Promise<Task> {
    return apiRequest<Task>(`/tasks/${id}/toggle/`, { method: 'POST' });
  },

  async addSubtask(taskId: EntityId, title: string): Promise<{ id: EntityId; title: string; completed: boolean; created_at: string }> {
    return apiRequest(`/tasks/${taskId}/add_subtask/`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
  },

  async toggleSubtask(taskId: EntityId, subtaskId: EntityId): Promise<{ id: EntityId; title: string; completed: boolean; created_at: string }> {
    return apiRequest(`/tasks/${taskId}/subtasks/${subtaskId}/toggle/`, { method: 'POST' });
  },

  async updateSubtask(taskId: EntityId, subtaskId: EntityId, title: string): Promise<{ id: EntityId; title: string; completed: boolean; created_at: string }> {
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
  async getAll(): Promise<Note[]> {
    return apiRequest<Note[]>('/notes/');
  },

  async create(title?: string, body?: string, color?: NoteColor): Promise<Note> {
    return apiRequest<Note>('/notes/', {
      method: 'POST',
      body: JSON.stringify({ 
        title: title || 'New note', 
        body: body || 'Write something down...',
        color: color || 'note-yellow',
      }),
    });
  },

  async update(id: EntityId, updates: Partial<Note>): Promise<Note> {
    return apiRequest<Note>(`/notes/${id}/`, {
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
  async getAll(): Promise<CalendarEvent[]> {
    return apiRequest<CalendarEvent[]>('/events/');
  },

  async create(payload: EventCreatePayload): Promise<CalendarEvent> {
    return apiRequest<CalendarEvent>('/events/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async update(id: EntityId, updates: Partial<CalendarEvent>): Promise<CalendarEvent> {
    return apiRequest<CalendarEvent>(`/events/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  async delete(id: EntityId): Promise<void> {
    await apiRequest(`/events/${id}/`, { method: 'DELETE' });
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

function mapUserToSettings(user: User): Settings {
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
    taskReminders: user.task_reminders ?? false,
  };
}

function mapSettingsToUserUpdates(settings: Partial<Settings>): Partial<User> {
  const updates: Partial<User> = {};
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
