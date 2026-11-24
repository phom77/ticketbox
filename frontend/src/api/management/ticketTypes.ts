import { apiCommand, apiGet } from '../client';
import type { TicketType } from '../concerts';
import { managementBase } from './scope';
import type { ManagementApiScope } from './scope';

export type TicketTypeMutation = {
  name: string;
  price: number;
  totalQuantity: number;
  maxPerAccount: number;
  zoneColor: string;
};

export function getAdminTicketTypes(
  concertId: string,
  signal?: AbortSignal,
  scope: ManagementApiScope = 'admin',
) {
  return apiGet<TicketType[]>(
    `${managementBase(scope)}/concerts/${encodeURIComponent(concertId)}/ticket-types`,
    signal,
  );
}

export function createTicketType(
  concertId: string,
  payload: TicketTypeMutation,
  scope: ManagementApiScope = 'admin',
) {
  return apiCommand<TicketType>(
    'post',
    `${managementBase(scope)}/concerts/${encodeURIComponent(concertId)}/ticket-types`,
    payload,
  );
}

export function updateTicketType(
  ticketTypeId: string,
  payload: TicketTypeMutation,
  scope: ManagementApiScope = 'admin',
) {
  return apiCommand<TicketType>(
    'put',
    `${managementBase(scope)}/ticket-types/${encodeURIComponent(ticketTypeId)}`,
    payload,
  );
}

export function updateTicketTypeStatus(
  ticketTypeId: string,
  isActive: boolean,
  scope: ManagementApiScope = 'admin',
) {
  return apiCommand<TicketType>(
    'patch',
    `${managementBase(scope)}/ticket-types/${encodeURIComponent(ticketTypeId)}/status`,
    { isActive },
  );
}

export function deleteTicketType(ticketTypeId: string, scope: ManagementApiScope = 'admin') {
  return apiCommand<void>(
    'delete',
    `${managementBase(scope)}/ticket-types/${encodeURIComponent(ticketTypeId)}`,
  );
}
