package org.ticketbox.checkin.guestlist.application.port;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.ticketbox.checkin.guestlist.domain.GuestList;

import java.util.Optional;
import java.util.UUID;

public interface GuestListRepository {

    Optional<GuestList> findByConcertIdAndPhoneAndIsActiveTrue(UUID concertId, String phone);

    Page<GuestList> findByConcertId(UUID concertId, Pageable pageable);

    Page<GuestList> search(UUID concertId, String query, boolean activeOnly, Pageable pageable);

    Optional<GuestList> findByConcertIdAndPhone(UUID concertId, String phone);

    java.util.List<GuestList> findAllByConcertId(UUID concertId);

    int checkInIfEligible(
            UUID guestId,
            UUID concertId,
            UUID staffId,
            String gate,
            java.time.OffsetDateTime checkedInAt);

    <S extends GuestList> S save(S entity);

    <S extends GuestList> java.util.List<S> saveAll(Iterable<S> entities);

    java.util.Optional<GuestList> findById(java.util.UUID id);

    void delete(GuestList entity);

    void deleteById(java.util.UUID id);

    void flush();
}
