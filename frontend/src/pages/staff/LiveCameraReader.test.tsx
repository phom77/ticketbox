import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./cameraSupport', () => ({
  canReadQrFromCamera: () => true,
  detectorConstructor: () => undefined,
}));

import { LiveCameraReader } from './LiveCameraReader';

const getUserMedia = vi.fn();
function track() {
  return { stop: vi.fn() };
}
function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
}

beforeEach(() => {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
});
afterEach(() => {
  setVisibility('visible');
  vi.resetAllMocks();
});

describe('LiveCameraReader', () => {
  it('stops the tracks when the page goes away while the permission prompt is open', async () => {
    const opened = track();
    let grant: (stream: unknown) => void = () => undefined;
    getUserMedia.mockReturnValue(new Promise((done) => (grant = done)));
    const { unmount } = render(<LiveCameraReader onCode={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
    unmount();
    await act(async () => grant({ getTracks: () => [opened] }));
    expect(opened.stop).toHaveBeenCalledTimes(1);
  });

  it('stops the tracks and pauses when the page was hidden before the camera opened', async () => {
    const opened = track();
    let grant: (stream: unknown) => void = () => undefined;
    getUserMedia.mockReturnValue(new Promise((done) => (grant = done)));
    render(<LiveCameraReader onCode={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
    setVisibility('hidden');
    await act(async () => grant({ getTracks: () => [opened] }));
    expect(opened.stop).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/camera stopped because the page was hidden/)).toBeVisible();
  });

  it('explains a camera that another app or tab is using', async () => {
    getUserMedia.mockRejectedValue(new DOMException('busy', 'NotReadableError'));
    render(<LiveCameraReader onCode={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
    expect(await screen.findByText(/in use by another app or tab/)).toBeVisible();
    expect(screen.queryByText(/permission was denied/)).toBeNull();
  });
});
