import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock localStorage
const mockLocalStorage = {
  data: {} as Record<string, string>,
  getItem: vi.fn((key: string) => mockLocalStorage.data[key] || null),
  setItem: vi.fn((key: string, value: string) => { mockLocalStorage.data[key] = value; }),
  removeItem: vi.fn((key: string) => { delete mockLocalStorage.data[key]; }),
  clear: vi.fn(() => { mockLocalStorage.data = {}; }),
};
vi.stubGlobal('localStorage', mockLocalStorage);

describe('API Client', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    mockLocalStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should include auth token in requests when available', async () => {
    mockLocalStorage.setItem('auth_token', 'test-token-123');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        count: 1,
        next: null,
        previous: null,
        results: [{ id: 1, title: 'Test Task' }],
      }),
    });

    const { tasksApi } = await import('@/api/index');
    await tasksApi.getAll();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/tasks/'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Token test-token-123',
        }),
      })
    );
  });

  it('should not include auth token when not available', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [],
    });

    const { tasksApi } = await import('@/api/index');
    await tasksApi.getAll();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/tasks/'),
      expect.objectContaining({
        headers: expect.not.objectContaining({
          'Authorization': expect.any(String),
        }),
      })
    );
  });

  it('should throw ApiError on 4xx responses without retrying', async () => {
    mockLocalStorage.setItem('auth_token', 'test-token');
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Invalid request' }),
    });

    const { tasksApi, ApiError } = await import('@/api/index');
    
    await expect(tasksApi.getAll()).rejects.toThrow(ApiError);
    expect(mockFetch).toHaveBeenCalledTimes(1); // Should not retry
  });

  it('should retry on 5xx errors with exponential backoff', async () => {
    mockLocalStorage.setItem('auth_token', 'test-token');
    
    // Fail twice with 500, then succeed
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          count: 1,
          next: null,
          previous: null,
          results: [{ id: 1, title: 'Success' }],
        }),
      });

    const { tasksApi } = await import('@/api/index');
    const promise = tasksApi.getAll();

    // Fast-forward through retries
    await vi.advanceTimersByTimeAsync(7000);

    const result = await promise;
    expect(result).toEqual([{ id: 1, title: 'Success' }]);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('should handle 204 No Content responses', async () => {
    mockLocalStorage.setItem('auth_token', 'test-token');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
    });

    const { tasksApi } = await import('@/api/index');
    const result = await tasksApi.delete('task-id-123');

    expect(result).toBeUndefined();
  });

  it('should parse JSON response correctly', async () => {
    mockLocalStorage.setItem('auth_token', 'test-token');
    const mockData = [
      { id: '1', title: 'Task 1', completed: false },
      { id: '2', title: 'Task 2', completed: true },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockData,
    });

    const { tasksApi } = await import('@/api/index');
    const result = await tasksApi.getAll();

    expect(result).toEqual(mockData);
  });

  it('should not retry non-idempotent (POST) requests on 5xx errors', async () => {
    mockLocalStorage.setItem('auth_token', 'test-token');
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server error' }),
    });

    const { tasksApi, ApiError } = await import('@/api/index');

    // A create that timed out server-side must not be replayed: retrying a
    // POST could duplicate the resource.
    await expect(tasksApi.create({ title: 'New task' })).rejects.toThrow(ApiError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should not retry DELETE requests on network errors', async () => {
    mockLocalStorage.setItem('auth_token', 'test-token');
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

    const { tasksApi } = await import('@/api/index');

    await expect(tasksApi.delete('task-id-123')).rejects.toThrow('Failed to fetch');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should fetch every page of a paginated collection', async () => {
    mockLocalStorage.setItem('auth_token', 'test-token');

    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: `t${i}`, title: `Task ${i}` }));
    const page2 = [{ id: 't100', title: 'Task 100' }];

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          count: 101,
          next: 'http://127.0.0.1:8000/api/tasks/?page=2',
          previous: null,
          results: page1,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          count: 101,
          next: null,
          previous: 'http://127.0.0.1:8000/api/tasks/',
          results: page2,
        }),
      });

    const { tasksApi } = await import('@/api/index');
    const result = await tasksApi.getAll();

    expect(result).toHaveLength(101);
    expect(result[0]).toEqual(page1[0]);
    expect(result[100]).toEqual(page2[0]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][0]).toContain('page=2');
  });

  it('should keep query params when following pagination links', async () => {
    mockLocalStorage.setItem('auth_token', 'test-token');

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          count: 2,
          next: 'http://127.0.0.1:8000/api/tasks/?completed=true&page=2',
          previous: null,
          results: [{ id: 't1', title: 'Task 1' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          count: 2,
          next: null,
          previous: null,
          results: [{ id: 't2', title: 'Task 2' }],
        }),
      });

    const { tasksApi } = await import('@/api/index');
    const result = await tasksApi.getAll({ completed: true });

    expect(result).toHaveLength(2);
    // The original filter must survive onto page 2.
    expect(mockFetch.mock.calls[1][0]).toContain('completed=true');
    expect(mockFetch.mock.calls[1][0]).toContain('page=2');
  });

  it('should mark all notifications read with a single bulk request', async () => {
    mockLocalStorage.setItem('auth_token', 'test-token');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ message: 'All notifications marked as read.', updated: 3 }),
    });

    const { notificationsApi } = await import('@/api/index');
    const result = await notificationsApi.markAllRead();

    expect(result.updated).toBe(3);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toContain('/notifications/mark_all_read/');
    expect(mockFetch.mock.calls[0][1]).toEqual(
      expect.objectContaining({ method: 'POST' })
    );
  });
});
