package org.ticketbox.checkin.guestlist.infrastructure.persistence;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.ticketbox.checkin.guestlist.domain.GuestList;

import java.util.Optional;
import java.util.UUID;

public interface JpaGuestListRepository
        extends org.ticketbox.checkin.guestlist.application.port.GuestListRepository,
                JpaRepository<GuestList, UUID> {

    Optional<GuestList> findByConcertIdAndPhoneAndIsActiveTrue(UUID concertId, String phone);

    Page<GuestList> findByConcertId(UUID concertId, Pageable pageable);

    @Query("""
            select g from GuestList g where g.concertId = :concertId
              and (:activeOnly = false or g.isActive = true)
              and (:query = '' or locate(lower(:query), lower(g.fullName)) > 0
                or locate(:query, g.phone) > 0 or locate(lower(:query), lower(g.category)) > 0
                or locate(lower(:query), lower(g.sponsorName)) > 0)
            """)
    Page<GuestList> search(UUID concertId, String query, boolean activeOnly, Pageable pageable);

    Optional<GuestList> findByConcertIdAndPhone(UUID concertId, String phone);

    java.util.List<GuestList> findAllByConcertId(UUID concertId);

    @Modifying
    @Query(
            """
            UPDATE GuestList g
               SET g.checkedInAt = :checkedInAt,
                   g.checkedInBy = :staffId,
                   g.checkinGate = :gate
             WHERE g.id = :guestId
               AND g.concertId = :concertId
               AND g.isActive = true
               AND g.checkedInAt IS NULL
            """)
    int checkInIfEligible(
            @Param("guestId") UUID guestId,
            @Param("concertId") UUID concertId,
            @Param("staffId") UUID staffId,
            @Param("gate") String gate,
            @Param("checkedInAt") java.time.OffsetDateTime checkedInAt);
}
