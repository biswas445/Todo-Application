import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock fetch and localStorage for E2E tests
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const mockLocalStorage = {
  data: {} as Record<string, string>,
  getItem: vi.fn((key: string) => mockLocalStorage.data[key] || null),
  setItem: vi.fn((key: string, value: string) => { mockLocalStorage.data[key] = value; }),
  removeItem: vi.fn((key: string) => { delete mockLocalStorage.data[key]; }),
  clear: vi.fn(() => { mockLocalStorage.data = {}; }),
};
vi.stubGlobal('localStorage', mockLocalStorage);

describe('End-to-End Tests', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    mockLocalStorage.clear();
  });

  describe('Authentication Flow', () => {
    it('should complete signup flow without auto-login', async () => {
      // Mock successful registration
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ token: 'new-token', user: { id: 1, username: 'testuser' } }),
      });

      const { authApi } = await import('@/api/index');
      const result = await authApi.register({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.token).toBe('new-token');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/register/'),
        expect.objectContaining({ method: 'POST' })
      );
      
      // Token should NOT be stored automatically (signup doesn't auto-login)
      expect(mockLocalStorage.setItem).not.toHaveBeenCalledWith('auth_token', 'new-token');
    });

    it('should complete signin flow and store token', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ token: 'login-token', user: { id: 1, username: 'testuser' } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ id: 1, username: 'testuser', email: 'test@example.com' }),
        });

      const { authApi } = await import('@/api/index');
      const result = await authApi.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.token).toBe('login-token');
      expect(mockFetch).toHaveBeenCalledTimes(2); // login + getMe
    });

    it('should handle failed login with invalid credentials', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Invalid credentials' }),
      });

      const { authApi, ApiError } = await import('@/api/index');
      
      await expect(authApi.login({
        email: 'test@example.com',
        password: 'wrongpassword',
      })).rejects.toThrow(ApiError);
    });
  });

  describe('Task CRUD Operations', () => {
    beforeEach(() => {
      mockLocalStorage.setItem('auth_token', 'test-token');
    });

    it('should create a task', async () => {
      const newTask = { id: '1', title: 'New Task', completed: false };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => newTask,
      });

      const { tasksApi } = await import('@/api/index');
      const result = await tasksApi.create({ title: 'New Task' });

      expect(result).toEqual(newTask);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/tasks/'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should get all tasks', async () => {
      const tasks = [
        { id: '1', title: 'Task 1', completed: false },
        { id: '2', title: 'Task 2', completed: true },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => tasks,
      });

      const { tasksApi } = await import('@/api/index');
      const result = await tasksApi.getAll();

      expect(result).toEqual(tasks);
    });

    it('should update a task', async () => {
      const updatedTask = { id: '1', title: 'Updated Task', completed: true };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => updatedTask,
      });

      const { tasksApi } = await import('@/api/index');
      const result = await tasksApi.update('1', { completed: true });

      expect(result).toEqual(updatedTask);
    });

    it('should delete a task', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      const { tasksApi } = await import('@/api/index');
      const result = await tasksApi.delete('1');

      expect(result).toBeUndefined();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/tasks/1/'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should toggle task completion', async () => {
      const toggledTask = { id: '1', title: 'Task', completed: true };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => toggledTask,
      });

      const { tasksApi } = await import('@/api/index');
      const result = await tasksApi.toggle('1');

      expect(result).toEqual(toggledTask);
    });
  });

  describe('List CRUD Operations', () => {
    beforeEach(() => {
      mockLocalStorage.setItem('auth_token', 'test-token');
    });

    it('should create a list', async () => {
      const newList = { id: '1', label: 'Work', color: '#FF5733' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => newList,
      });

      const { listsApi } = await import('@/api/index');
      const result = await listsApi.create({ label: 'Work', color: '#FF5733' });

      expect(result).toEqual(newList);
    });

    it('should delete a list', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      const { listsApi } = await import('@/api/index');
      await listsApi.delete('1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/lists/1/'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('Tag CRUD Operations', () => {
    beforeEach(() => {
      mockLocalStorage.setItem('auth_token', 'test-token');
    });

    it('should create a tag', async () => {
      const newTag = { id: '1', label: 'Urgent', color: '#FF0000' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => newTag,
      });

      const { tagsApi } = await import('@/api/index');
      const result = await tagsApi.create({ label: 'Urgent', color: '#FF0000' });

      expect(result).toEqual(newTag);
    });

    it('should delete a tag', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      const { tagsApi } = await import('@/api/index');
      await tagsApi.delete('1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/tags/1/'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('Data Isolation', () => {
    it('should only return authenticated user\'s data', async () => {
      mockLocalStorage.setItem('auth_token', 'user1-token');
      
      const user1Tasks = [{ id: '1', title: 'User 1 Task' }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => user1Tasks,
      });

      const { tasksApi } = await import('@/api/index');
      const result = await tasksApi.getAll();

      expect(result).toEqual(user1Tasks);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/tasks/'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Token user1-token',
          }),
        })
      );
    });
  });
});
