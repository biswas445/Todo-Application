import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AuthShell from '@/components/AuthShell';
import type { Store } from '@/store/useAppStore';

const storeStub = {} as Store;
const noop = () => {};

function assertEventPrevented(target: HTMLElement, eventType: string) {
  let prevented = false;
  const listener = (e: Event) => { prevented = e.defaultPrevented; };
  document.addEventListener(eventType, listener);
  fireEvent(target, new Event(eventType, { bubbles: true, cancelable: true }));
  document.removeEventListener(eventType, listener);
  expect(prevented).toBe(true);
}

describe('auth password field', () => {
  it.each(['signin', 'signup'] as const)('blocks paste, copy and cut on the %s password field', (view) => {
    render(<AuthShell view={view} onView={noop} store={storeStub} />);
    const input = screen.getByLabelText('Password');

    assertEventPrevented(input, 'paste');
    assertEventPrevented(input, 'copy');
    assertEventPrevented(input, 'cut');
    assertEventPrevented(input, 'drop');
  });

  it('still allows typing the password manually', () => {
    render(<AuthShell view="signin" onView={noop} store={storeStub} />);
    const input = screen.getByLabelText('Password') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'hunter2' } });
    expect(input.value).toBe('hunter2');
  });

  it('keeps the visibility toggle working', () => {
    render(<AuthShell view="signin" onView={noop} store={storeStub} />);
    const input = screen.getByLabelText('Password') as HTMLInputElement;
    expect(input.type).toBe('password');

    fireEvent.click(screen.getByLabelText('Toggle password visibility'));
    expect(input.type).toBe('text');

    fireEvent.click(screen.getByLabelText('Toggle password visibility'));
    expect(input.type).toBe('password');
  });
});
