package org.ticketbox.checkin.guestlist.application;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.checkin.application.error.AppException;
import org.ticketbox.checkin.application.error.ErrorCode;
import org.ticketbox.checkin.guestlist.application.dto.GuestLookupResponse;
import org.ticketbox.checkin.guestlist.application.port.GuestListRepository;
import org.ticketbox.checkin.guestlist.domain.GuestList;
import org.ticketbox.checkin.guestlist.domain.PhoneNormalizer;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class GuestListService {

    private final GuestListRepository guestListRepository;
    private final PhoneNormalizer phoneNormalizer;

    @Transactional(readOnly = true)
    public GuestLookupResponse findActiveGuest(UUID concertId, String phone) {
        String normalizedPhone = phoneNormalizer.normalize(phone);
        if (normalizedPhone == null) {
            return GuestLookupResponse.notFound();
        }

        return guestListRepository
                .findByConcertIdAndPhoneAndIsActiveTrue(concertId, normalizedPhone)
                .map(this::toResponse)
                .orElseGet(GuestLookupResponse::notFound);
    }

    @Transactional(readOnly = true)
    public java.util.List<GuestList> getGuestListByConcertId(UUID concertId) {
        return guestListRepository.findAllByConcertId(concertId);
    }

    @Transactional
    public GuestLookupResponse checkIn(UUID guestId, UUID concertId, UUID staffId, String gate) {
        String normalizedGate = gate == null || gate.isBlank() ? "VIP" : gate.trim();
        int updated =
                guestListRepository.checkInIfEligible(
                        guestId,
                        concertId,
                        staffId,
                        normalizedGate,
                        java.time.OffsetDateTime.now());
        GuestList guest =
                guestListRepository
                        .findById(guestId)
                        .orElseThrow(
                                () ->
                                        new AppException(
                                                ErrorCode.RESOURCE_NOT_FOUND,
                                                "error.guest.not-found"));
        if (!guest.getConcertId().equals(concertId)) {
            throw new AppException(ErrorCode.UNAUTHORIZED, "error.guest.wrong-concert");
        }
        if (updated == 0 && guest.getCheckedInAt() == null) {
            throw new AppException(ErrorCode.INVALID_STATUS_TRANSITION, "error.guest.inactive");
        }
        return toResponse(guest);
    }

    private GuestLookupResponse toResponse(GuestList guest) {
        return new GuestLookupResponse(
                true,
                guest.getId(),
                guest.getConcertId(),
                guest.getPhone(),
                guest.getFullName(),
                guest.getCategory(),
                guest.getSponsorName(),
                guest.getNotes(),
                guest.getCheckedInAt(),
                guest.getCheckinGate());
    }
}
