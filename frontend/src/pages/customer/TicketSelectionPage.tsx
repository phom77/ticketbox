import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthContext';
import { ConcertTickets } from '../../features/ticketSelection/ConcertTickets';
import { PerformanceTickets } from '../../features/ticketSelection/PerformanceTickets';

/**
 * Choose tickets for both catalog models. A performance route carries the event and the
 * performance; a legacy concert is its own event (ADR 0003) and has no performance segment.
 */
export function TicketSelectionPage() {
  const { eventId, id } = useParams();
  const { user } = useAuth();
  if (!eventId) return <Navigate to="/events" replace />;
  return id ? (
    <PerformanceTickets key={id} id={id} eventId={eventId} />
  ) : (
    <ConcertTickets key={`${user?.id ?? ''}:${eventId}`} id={eventId} />
  );
}
