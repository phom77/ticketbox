// API
export type ApiFieldError = {
  field?: string;
  message: string;
};

export type ApiResponse<T> = {
  success?: boolean;
  code?: number;
  message: string;
  data: T;
  errors?: ApiFieldError[] | null;
};

export type PageResponse<T> = {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
  first: boolean;
  last: boolean;
  empty: boolean;
};

// Auth
export type StaffUser = {
  id: string;
  email: string;
  fullName: string;
  role: 'AUDIENCE' | 'ORGANIZER' | 'STAFF' | 'ADMIN';
};

export type AuthResponse = {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: StaffUser;
};

// Check-in
export type TicketDatasetEntry = {
  ticketId: string;
  qrCode: string;
  qrSecret: string;
  ticketTypeId: string;
  userId: string;
};

export type CheckinDatasetResponse = {
  concertId: string;
  generatedAt: string;
  totalCount: number;
  tickets: TicketDatasetEntry[];
};

export type OfflineCheckinLogPayload = {
  qrCode: string;
  checkedAt: string;
  gate?: string | null;
  notes?: string | null;
};

// Sync
export type SyncCheckinRequestPayload = {
  concertId: string;
  deviceId: string;
  logs: OfflineCheckinLogPayload[];
};

export type SyncResultEntry = {
  qrCode: string;
  result: 'ACCEPTED' | 'SKIPPED' | 'INVALID' | string;
  reason: string;
};

export type SyncCheckinResponse = {
  total: number;
  accepted: number;
  skipped: number;
  invalid: number;
  results: SyncResultEntry[];
};

export type ScanTicketRequestPayload = {
  qrCode: string;
  concertId: string;
  deviceId: string;
  gate?: string | null;
};

export type ScanTicketResponse = {
  ticketId: string | null;
  concertId: string;
  status: string;
  message: string;
  checkAt: string;
};

export type StaffConcert = {
  id: string;
  title: string;
  venueName: string;
  venueAddress: string;
  eventDate: string;
  doorsOpenAt: string | null;
  status: 'ON_SALE' | 'SOLD_OUT' | 'COMPLETED' | 'CANCELLED';
  posterUrl: string | null;
};

export type StaffConcertOverview = {
  concert: StaffConcert;
  totalTickets: number;
  validTickets: number;
  usedTickets: number;
  cancelledTickets: number;
  transferredTickets: number;
  totalCheckins: number;
  datasetUpdatedAt: string | null;
};

export type StaffTicket = {
  ticketId: string;
  ticketTypeId: string;
  userId: string;
  qrCode: string;
  status: 'VALID' | 'USED' | 'CANCELLED' | 'TRANSFERRED';
  issuedAt: string;
  usedAt: string | null;
};

export type ServerCheckinHistory = {
  id: string;
  ticketId: string;
  concertId: string;
  staffId: string;
  deviceId: string | null;
  checkedAt: string;
  syncAt: string | null;
  offline: boolean;
  gate: string | null;
  notes: string | null;
  qrCode: string | null;
  ticketStatus: string | null;
};

export type StaffGuestListEntry = {
  found: boolean;
  guestId: string;
  concertId: string;
  phone: string;
  fullName: string;
  category: string;
  sponsorName: string;
  notes: string | null;
  checkedInAt: string | null;
  checkinGate: string | null;
};
