import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { lazy } from 'react';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { WorkspaceRouteBoundary } from './WorkspaceRouteBoundary';

describe('WorkspaceRouteBoundary', () => {
  it('announces loading until the page arrives', async () => {
    let resolve!: (module: { default: () => JSX.Element }) => void;
    const Page = lazy(
      () => new Promise<{ default: () => JSX.Element }>((done) => (resolve = done)),
    );
    render(
      <WorkspaceRouteBoundary>
        <Page />
      </WorkspaceRouteBoundary>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Loading page…');
    resolve({ default: () => <h1>Orders</h1> });
    expect(await screen.findByRole('heading', { name: 'Orders' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('offers a reload when the page cannot be downloaded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const swallow = (event: ErrorEvent) => event.preventDefault();
    window.addEventListener('error', swallow);
    onTestFinished(() => window.removeEventListener('error', swallow));
    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload });
    const Page = lazy(() =>
      Promise.reject(new TypeError('Failed to fetch dynamically imported module')),
    );
    render(
      <WorkspaceRouteBoundary>
        <Page />
      </WorkspaceRouteBoundary>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('This page could not open');
    await userEvent.click(screen.getByRole('button', { name: 'Reload page' }));
    expect(reload).toHaveBeenCalledOnce();
  });
});
