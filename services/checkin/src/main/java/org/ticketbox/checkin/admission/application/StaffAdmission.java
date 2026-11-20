package org.ticketbox.checkin.admission.application;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.checkin.admission.application.dto.CheckinHistoryResponse;
import org.ticketbox.checkin.admission.application.dto.ScanTicketRequest;
import org.ticketbox.checkin.admission.application.dto.ScanTicketResponse;
import org.ticketbox.checkin.admission.application.dto.StaffConcertOverviewResponse;
import org.ticketbox.checkin.admission.application.dto.StaffConcertResponse;
import org.ticketbox.checkin.admission.application.dto.StaffTicketResponse;
import org.ticketbox.checkin.admission.application.dto.SyncCheckinRequest;
import org.ticketbox.checkin.admission.application.dto.SyncCheckinResponse;
import org.ticketbox.checkin.admission.application.port.StaffAssignments;
import org.ticketbox.checkin.application.error.AppException;
import org.ticketbox.checkin.application.error.ErrorCode;
import org.ticketbox.checkin.guestlist.application.GuestListService;
import org.ticketbox.checkin.guestlist.application.dto.GuestLookupResponse;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Service
@Transactional
public class StaffAdmission {
    private final StaffAssignments assignments;
    private final CheckinService checkin;

    private final GuestListService guests;

    public StaffAdmission(StaffAssignments assignments, CheckinService checkin, GuestListService guests) {
        this.assignments = assignments;
        this.checkin = checkin;
        this.guests = guests;
    }

    @Transactional(readOnly = true)
    public Page<StaffConcertResponse> performances(UUID organization, UUID staff, Pageable pageable) {
        return assignments.performances(organization, staff, pageable);
    }

    public StaffConcertOverviewResponse overview(UUID organization, UUID staff, UUID performance) {
        requireAssigned(organization, staff, performance);
        return checkin.getStaffConcertOverview(performance);
    }

    public Dataset dataset(UUID organization, UUID staff, UUID performance) {
        requireAssigned(organization, staff, performance);
        var source = checkin.getCheckinDataset(performance);
        var entries = source.tickets().stream()
                .map(ticket -> new DatasetTicket(ticket.ticketId(), ticket.qrCode(), ticket.ticketTypeId()))
                .toList();
        return new Dataset(performance, source.generatedAt(), source.totalCount(), entries);
    }

    public Page<StaffTicketResponse> tickets(
            UUID organization, UUID staff, UUID performance, String query, String status, Pageable pageable) {
        requireAssigned(organization, staff, performance);
        return checkin.getStaffTickets(performance, query, status, pageable);
    }

    public Page<CheckinHistoryResponse> history(UUID organization, UUID staff, UUID performance, Pageable pageable) {
        requireAssigned(organization, staff, performance);
        return checkin.getCheckinHistory(performance, pageable);
    }

    public Page<GuestLookupResponse> guests(UUID organization, UUID staff, UUID performance, Pageable pageable) {
        requireAssigned(organization, staff, performance);
        return guests.listStaffGuests(performance, pageable);
    }

    public GuestLookupResponse checkInGuest(UUID organization, UUID staff, UUID performance, UUID guestId, String gate) {
        requireAssigned(organization, staff, performance);
        return guests.checkIn(guestId, performance, staff, gate);
    }

    public ScanTicketResponse scan(UUID organization, UUID staff, ScanTicketRequest request) {
        requireAssigned(organization, staff, request.concertId());
        return checkin.scan(request, staff);
    }

    public SyncCheckinResponse sync(UUID organization, UUID staff, SyncCheckinRequest request) {
        requireAssigned(organization, staff, request.concertId());
        return checkin.syncOfflineLogs(request, staff);
    }

    public List<StaffAssignments.Assignment> assignments(UUID organization, UUID performance) {
        requireOwnedPerformance(organization, performance);
        return assignments.list(performance);
    }

    public void grant(UUID organization, UUID performance, UUID staff, UUID manager) {
        requireOwnedPerformance(organization, performance);
        assignments.grant(performance, staff, manager);
    }

    public void revoke(UUID organization, UUID performance, UUID staff, UUID manager) {
        requireOwnedPerformance(organization, performance);
        assignments.revoke(performance, staff, manager);
    }

    private void requireAssigned(UUID organization, UUID staff, UUID performance) {
        if (!assignments.lockAssignment(organization, performance, staff)) {
            throw new AppException(ErrorCode.UNAUTHORIZED, "error.unauthorized");
        }
    }

    private void requireOwnedPerformance(UUID organization, UUID performance) {
        if (!assignments.lockOwnedPerformance(organization, performance)) {
            throw new AppException(ErrorCode.RESOURCE_NOT_FOUND, "error.concert.not-found-by-id", performance);
        }
    }

    public record Dataset(UUID concertId, OffsetDateTime generatedAt, int totalCount, List<DatasetTicket> tickets) {}

    public record DatasetTicket(UUID ticketId, String qrCode, UUID ticketTypeId) {}
}
