package com.ticketbox.module.admin.domain;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.Optional;
import java.util.UUID;

public interface GuestListRepository extends JpaRepository<GuestList, UUID> {

    Optional<GuestList> findByConcertIdAndPhoneAndIsActiveTrue(UUID concertId, String phone);

    Page<GuestList> findByConcertId(UUID concertId, Pageable pageable);
  
    Optional<GuestList> findByConcertIdAndPhone(UUID concertId, String phone);

    java.util.List<GuestList> findAllByConcertId(UUID concertId);

    @Modifying
    @Query("""
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
