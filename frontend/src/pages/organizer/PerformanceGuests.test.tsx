import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PerformanceGuests } from './PerformanceGuests';

describe('PerformanceGuests', () => {
  it('explains when guest import becomes available before the first release', () => {
    render(
      <MemoryRouter>
        <PerformanceGuests
          performanceId="p1"
          label="Show"
          released={false}
          reviewPath="/organizer/events/e1?step=review"
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Guest import opens after release' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Go to the release step' })).toHaveAttribute(
      'href',
      '/organizer/events/e1?step=review',
    );
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });
});
