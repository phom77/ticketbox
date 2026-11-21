package org.ticketbox.checkin.admission.application.port;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.ticketbox.checkin.admission.application.dto.StaffConcertResponse;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface StaffAssignments {
    Page<StaffConcertResponse> performances(UUID organization, UUID staff, Pageable pageable);

    boolean lockAssignment(UUID organization, UUID performance, UUID staff);

    boolean lockOwnedPerformance(UUID organization, UUID performance);

    List<Assignment> list(UUID performance);

    void grant(UUID performance, UUID staff, UUID manager);

    void revoke(UUID performance, UUID staff, UUID manager);

    record Assignment(UUID staffId, UUID grantedBy, OffsetDateTime grantedAt) {}
}
