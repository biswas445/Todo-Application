import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '@/App';

// Regression tests for the auth flow at the App level:
// - a failed sign-in must keep AuthShell mounted so the error renders
//   (previously store.loading unmounted the form mid-request and the
//   error setState hit an unmounted component),
// - the sign-up success banner must survive the redirect to sign-in.

const mockLocalStorage = {
  data: {} as Record<string, string>,
  getItem: vi.fn((key: string) => mockLocalStorage.data[key] || null),
  setItem: vi.fn((key: string, value: string) => { mockLocalStorage.data[key] = value; }),
  removeItem: vi.fn((key: string) => { delete mockLocalStorage.data[key]; }),
  clear: vi.fn(() => { mockLocalStorage.data = {}; }),
};

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    json: async () => data,
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', mockLocalStorage);
  mockLocalStorage.clear();
  // The signed-in workspace opens a WebSocket; keep it inert in tests.
  vi.stubGlobal('WebSocket', class {
    static OPEN = 1;
    readyState = 0;
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    onclose: ((event: { code: number; reason: string }) => void) | null = null;
    close() { this.readyState = 3; }
    send() {}
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function goToSignIn() {
  fireEvent.click(screen.getByText('Get Started'));
}

describe('auth error surfacing', () => {
  it('shows the sign-in error when credentials are invalid', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname.replace(/^\/api/, '');
      const method = init?.method ?? 'GET';
      if (method === 'POST' && path === '/auth/login/') {
        return jsonResponse({ error: 'Invalid email or password.' }, 401);
      }
      throw new Error(`Unhandled test request: ${method} ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    goToSignIn();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'tester@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await screen.findByText('Invalid email or password.');
    // The form is still on screen (it was unmounted before the fix).
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(mockLocalStorage.getItem('auth_token')).toBeNull();
  });

  it('shows the signup success banner and redirects to sign-in', async () => {
    const user = {
      id: 'u1',
      username: 'new@example.com',
      email: 'new@example.com',
      first_name: 'New',
      last_name: 'User',
      bio: '',
      timezone: 'UTC',
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname.replace(/^\/api/, '');
      const method = init?.method ?? 'GET';
      if (method === 'POST' && path === '/auth/register/') {
        // Registration no longer returns a token: the account must verify
        // its email before sign-in is possible.
        return jsonResponse({ message: 'Account created.', user }, 201);
      }
      throw new Error(`Unhandled test request: ${method} ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    goToSignIn();
    fireEvent.click(screen.getByText('Sign up', { selector: 'strong' }));

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New User' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));

    // The banner appears on the sign-in view after the redirect timeout.
    await screen.findByText(/Account created/i, {}, { timeout: 3000 });
    await screen.findByText(/Check your email/i, {}, { timeout: 3000 });
    expect(screen.getByLabelText('Email')).toBeTruthy();
    // No session is created at signup.
    expect(mockLocalStorage.getItem('auth_token')).toBeNull();
  }, 10000);

  it('keeps the sign-in form responsive after a failed attempt and recovers', async () => {
    const user = {
      id: 'u1',
      username: 'tester@example.com',
      email: 'tester@example.com',
      first_name: 'Test',
      last_name: 'User',
      bio: '',
      timezone: 'UTC',
    };
    let loginCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname.replace(/^\/api/, '');
      const method = init?.method ?? 'GET';
      if (method === 'POST' && path === '/auth/login/') {
        loginCalls += 1;
        if (loginCalls === 1) return jsonResponse({ error: 'Invalid email or password.' }, 401);
        return jsonResponse({ token: 'fresh-token', user });
      }
      if (method === 'POST' && path === '/auth/ws_ticket/') {
        return jsonResponse({ ticket: 'test-ticket' });
      }
      if (method === 'GET') return jsonResponse([]);
      throw new Error(`Unhandled test request: ${method} ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    goToSignIn();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'tester@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('Invalid email or password.');

    // Retry with the correct password from the same form.
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(screen.queryByText('Invalid email or password.')).toBeNull());
    await screen.findByRole('heading', { name: 'Today' });
    expect(loginCalls).toBe(2);
  }, 10000);
});
