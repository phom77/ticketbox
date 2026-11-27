import { Navigate, useLocation, useParams } from 'react-router-dom';

/** A legacy concert id is also its event id, so old organizer links open the same record in the event workspace. */
export function OrganizerEventRedirect({ suffix = '' }: { suffix?: string }) {
  const { id } = useParams();
  const { search } = useLocation();
  return id ? (
    <Navigate to={'/organizer/events/' + encodeURIComponent(id) + suffix + search} replace />
  ) : (
    <Navigate to="/organizer/events" replace />
  );
}
