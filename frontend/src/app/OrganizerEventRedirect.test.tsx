import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { OrganizerEventRedirect } from './OrganizerEventRedirect';

function Where() {
  const { pathname, search } = useLocation();
  return <p>{pathname + search}</p>;
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/organizer/concerts/:id" element={<OrganizerEventRedirect />} />
        <Route
          path="/organizer/concerts/:id/preview"
          element={<OrganizerEventRedirect suffix="/preview" />}
        />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('organizer legacy concert links', () => {
  it('open the same id in the event workspace', () => {
    renderAt('/organizer/concerts/abc-123');
    expect(screen.getByText('/organizer/events/abc-123')).toBeInTheDocument();
  });

  it('keep the preview suffix and the query', () => {
    renderAt('/organizer/concerts/abc-123/preview?x=1');
    expect(screen.getByText('/organizer/events/abc-123/preview?x=1')).toBeInTheDocument();
  });
});
