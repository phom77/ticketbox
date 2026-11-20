package org.ticketbox.checkin.admission.infrastructure;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.ticketbox.checkin.admission.application.dto.StaffConcertResponse;
import org.ticketbox.checkin.admission.application.port.StaffAssignments;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Component
class JdbcStaffAssignments implements StaffAssignments {
    private static final String ASSIGNED_PERFORMANCES = """
            FROM staff_admission_assignments a JOIN concerts c ON c.id=a.concert_id
            WHERE c.organization_id=? AND a.staff_id=? AND a.revoked_at IS NULL
            """;

    private final JdbcTemplate jdbc;

    JdbcStaffAssignments(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Page<StaffConcertResponse> performances(UUID organization, UUID staff, Pageable pageable) {
        var content = jdbc.query("""
                        SELECT c.id,c.title,c.venue_name,c.venue_address,c.event_date,c.doors_open_at,c.status,c.poster_url
                        """ + ASSIGNED_PERFORMANCES + " ORDER BY c.event_date,c.id LIMIT ? OFFSET ?",
                (row, index) -> new StaffConcertResponse(
                        row.getObject("id", UUID.class),
                        row.getString("title"),
                        row.getString("venue_name"),
                        row.getString("venue_address"),
                        row.getObject("event_date", OffsetDateTime.class),
                        row.getObject("doors_open_at", OffsetDateTime.class),
                        row.getString("status"),
                        row.getString("poster_url")),
                organization, staff, pageable.getPageSize(), pageable.getOffset());
        Long total = jdbc.queryForObject("SELECT count(*) " + ASSIGNED_PERFORMANCES, Long.class,
                organization, staff);
        return new PageImpl<>(content, pageable, total == null ? 0 : total);
    }

    @Override
    public boolean lockAssignment(UUID organization, UUID performance, UUID staff) {
        return lockOwnedPerformance(organization, performance)
                && !jdbc.queryForList("""
                        SELECT concert_id FROM staff_admission_assignments
                        WHERE concert_id=? AND staff_id=? AND revoked_at IS NULL FOR SHARE
                        """, UUID.class, performance, staff).isEmpty();
    }

    @Override
    public boolean lockOwnedPerformance(UUID organization, UUID performance) {
        return !jdbc.queryForList("SELECT id FROM concerts WHERE organization_id=? AND id=? FOR SHARE",
                UUID.class, organization, performance).isEmpty();
    }

    @Override
    public List<Assignment> list(UUID performance) {
        return jdbc.query("""
                        SELECT staff_id, granted_by, granted_at FROM staff_admission_assignments
                        WHERE concert_id=? AND revoked_at IS NULL ORDER BY granted_at,staff_id
                        """, (row, index) -> new Assignment(
                        row.getObject("staff_id", UUID.class),
                        row.getObject("granted_by", UUID.class),
                        row.getObject("granted_at", OffsetDateTime.class)), performance);
    }

    @Override
    public void grant(UUID performance, UUID staff, UUID manager) {
        jdbc.update("""
                INSERT INTO staff_admission_assignments(concert_id,staff_id,granted_by) VALUES(?,?,?)
                ON CONFLICT(concert_id,staff_id) DO UPDATE
                SET granted_by=EXCLUDED.granted_by,granted_at=EXCLUDED.granted_at,revoked_by=NULL,revoked_at=NULL
                WHERE staff_admission_assignments.revoked_at IS NOT NULL
                """, performance, staff, manager);
    }

    @Override
    public void revoke(UUID performance, UUID staff, UUID manager) {
        jdbc.update("""
                UPDATE staff_admission_assignments SET revoked_at=now(),revoked_by=?
                WHERE concert_id=? AND staff_id=? AND revoked_at IS NULL
                """, manager, performance, staff);
    }
}
