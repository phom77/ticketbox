package org.ticketbox.checkin.guestlist.application;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.checkin.guestlist.application.dto.GuestListEntryResponse;
import org.ticketbox.checkin.guestlist.application.port.GuestListRepository;

import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class GuestListManagementService {

    private final GuestListRepository guestListRepository;
    private final GuestListAccessService accessService;

    public GuestListManagementService(
            GuestListRepository guestListRepository, GuestListAccessService accessService) {
        this.guestListRepository = guestListRepository;
        this.accessService = accessService;
    }

    public Page<GuestListEntryResponse> list(
            UUID concertId, UUID userId, boolean admin, Pageable pageable) {
        return list(concertId, userId, admin, null, false, pageable);
    }

    public Page<GuestListEntryResponse> list(UUID concertId, UUID userId, boolean admin,
            String query, boolean activeOnly, Pageable pageable) {
        accessService.requireAccess(concertId, userId, admin);
        return guestListRepository
                .search(concertId, query == null ? "" : query.strip(), activeOnly, pageable)
                .map(
                        guest ->
                                new GuestListEntryResponse(
                                        guest.getId(),
                                        guest.getConcertId(),
                                        guest.getPhone(),
                                        guest.getFullName(),
                                        guest.getCategory(),
                                        guest.getSponsorName(),
                                        guest.getNotes(),
                                        guest.isActive(),
                                        guest.getImportedAt(),
                                        guest.getBatchFile(),
                                        guest.getCheckedInAt(),
                                        guest.getCheckinGate()));
    }
}
