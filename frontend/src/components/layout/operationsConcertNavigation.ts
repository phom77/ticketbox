import { type Dispatch, type MouseEvent, type SetStateAction, useLayoutEffect } from 'react';
import { useLocation, useOutletContext } from 'react-router-dom';
import { useOrganization } from '../../features/organizations/OrganizationProvider';

export type OperationsConcert = {
  title: string;
  concertId?: string;
  eventId?: string;
  performanceId?: string;
  canLeave?: () => boolean;
  links: readonly {
    to: string;
    label: string;
    current?: boolean;
    state?: unknown;
    onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  }[];
};

export type OperationsConcertContext = OperationsConcert & {
  pathname: string;
  organizationId: string | undefined;
};

type SetConcert = Dispatch<SetStateAction<OperationsConcertContext | null>>;

export function useOperationsConcert(concert: OperationsConcert | null) {
  const setConcert = useOutletContext<SetConcert | null>();
  const { pathname } = useLocation();
  const organizationId = useOrganization()?.selected?.id;

  useLayoutEffect(() => {
    if (!setConcert || !concert) return;
    const context = { ...concert, pathname, organizationId };
    setConcert(context);
    return () => setConcert((current) => current === context ? null : current);
  }, [concert, pathname, organizationId, setConcert]);
}
