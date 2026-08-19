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
      json: async () => ({ id: 1, title: 'Test Task' }),
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
        json: async () => ({ id: 1, title: 'Success' }),
      });

    const { tasksApi } = await import('@/api/index');
    const promise = tasksApi.getAll();

    // Fast-forward through retries
    await vi.advanceTimersByTimeAsync(7000);

    const result = await promise;
    expect(result).toEqual({ id: 1, title: 'Success' });
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
});
