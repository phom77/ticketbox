package com.ticketbox.module.admin.application;

import com.ticketbox.module.admin.domain.GuestListRepository;
import com.ticketbox.module.admin.web.dto.GuestListEntryResponse;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class GuestListManagementService {

    private final GuestListRepository guestListRepository;
    private final GuestListAccessService accessService;

    public GuestListManagementService(
            GuestListRepository guestListRepository,
            GuestListAccessService accessService) {
        this.guestListRepository = guestListRepository;
        this.accessService = accessService;
    }

    public Page<GuestListEntryResponse> list(
            UUID concertId,
            UUID userId,
            boolean admin,
            Pageable pageable) {
        accessService.requireAccess(concertId, userId, admin);
        return guestListRepository.findByConcertId(concertId, pageable)
                .map(guest -> new GuestListEntryResponse(
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
