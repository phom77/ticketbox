package org.ticketbox.identity.organization.infrastructure.persistence;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.ticketbox.identity.organization.application.port.OrganizerOnboardingStore;
import org.ticketbox.identity.organization.domain.OrganizationGrant;

import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Repository
class JdbcOrganizerOnboardingStore implements OrganizerOnboardingStore {
    private static final String APPLICATION_ROWS = """
            SELECT a.*, EXISTS(SELECT 1 FROM organizer_account_links l WHERE l.organization_id=a.organization_id
                               AND l.manager_id=a.manager_id AND l.consumed_at IS NULL) activation_pending
            FROM organizer_applications a
            """;
    private static final RowMapper<Application> APPLICATION = (row, index) -> new Application(
            row.getObject("id", UUID.class), row.getString("organization_name"), row.getString("manager_name"),
            row.getString("email"), row.getString("first_event"), row.getObject("organization_id", UUID.class),
            row.getObject("manager_id", UUID.class), row.getBoolean("activation_pending"));
    private static final RowMapper<Link> LINK = (row, index) -> new Link(row.getObject("id", UUID.class),
            row.getObject("organization_id", UUID.class), row.getObject("manager_id", UUID.class),
            row.getString("email"), Arrays.stream((String[]) row.getArray("grants").getArray())
                .map(OrganizationGrant::valueOf).collect(Collectors.toUnmodifiableSet()),
            row.getObject("expires_at", OffsetDateTime.class), row.getObject("next_attempt_at") == null);

    private final JdbcTemplate db;

    JdbcOrganizerOnboardingStore(JdbcTemplate db) {
        this.db = db;
    }

    public void issueApplication(UUID id) {
        db.update("INSERT INTO organizer_applications(id) VALUES (?)", id);
    }

    public boolean submit(UUID id, Details details) {
        return db.update("""
                UPDATE organizer_applications SET organization_name=?,manager_name=?,email=?,first_event=?,
                    submitted_at=clock_timestamp()
                WHERE id=? AND submitted_at IS NULL AND expires_at>clock_timestamp()
                """, details.organizationName(), details.managerName(), details.email(), details.firstEvent(), id) == 1;
    }

    public List<Application> applications() {
        return db.query(APPLICATION_ROWS + """
                WHERE submitted_at IS NOT NULL
                ORDER BY reviewed_at IS NOT NULL, submitted_at DESC LIMIT 100
                """, APPLICATION);
    }

    public Optional<Application> lockApplication(UUID id) {
        return db.query(APPLICATION_ROWS + " WHERE a.id=? AND submitted_at IS NOT NULL FOR UPDATE OF a",
                APPLICATION, id).stream().findFirst();
    }

    public void approve(UUID id, UUID organization, UUID manager, UUID actor) {
        db.update("""
                UPDATE organizer_applications SET organization_id=?,manager_id=?,reviewed_by=?,reviewed_at=clock_timestamp()
                WHERE id=?
                """, organization, manager, actor, id);
    }

    public List<Link> pending(UUID organization) {
        return db.query("""
                SELECT * FROM organizer_account_links WHERE organization_id=? AND consumed_at IS NULL
                ORDER BY email
                """, LINK, organization);
    }

    public Optional<Link> link(UUID id, boolean lock) {
        return db.query("""
                SELECT * FROM organizer_account_links
                WHERE id=? AND consumed_at IS NULL AND expires_at>clock_timestamp()
                """ + (lock ? " FOR UPDATE" : ""), LINK, id).stream().findFirst();
    }

    public Optional<Link> activeLink(UUID organization, String email) {
        return db.query("""
                SELECT * FROM organizer_account_links WHERE organization_id=? AND email=?
                AND consumed_at IS NULL AND expires_at>clock_timestamp()
                """, LINK, organization, email).stream().findFirst();
    }

    public void issueLink(UUID id, UUID organization, UUID manager, String email, Set<OrganizationGrant> grants, UUID actor) {
        db.update("DELETE FROM organizer_account_links WHERE organization_id=? AND email=? AND consumed_at IS NULL",
                organization, email);
        db.update("""
                INSERT INTO organizer_account_links(id,organization_id,manager_id,email,grants,created_by,next_attempt_at)
                VALUES (?,?,?,?,string_to_array(?,','),?,clock_timestamp())
                """, id, organization, manager, email,
                grants.stream().map(Enum::name).sorted().collect(Collectors.joining(",")), actor);
    }

    public void consume(UUID id) {
        db.update("UPDATE organizer_account_links SET consumed_at=clock_timestamp(),next_attempt_at=NULL WHERE id=?", id);
    }

    public Optional<Lease> claim(UUID lease) {
        return db.query("""
                WITH candidate AS (
                    SELECT id FROM organizer_account_links WHERE next_attempt_at<=clock_timestamp()
                    AND expires_at>clock_timestamp() AND consumed_at IS NULL
                    ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1
                )
                UPDATE organizer_account_links l SET lease_id=?,next_attempt_at=clock_timestamp()+interval '45 seconds'
                FROM candidate WHERE l.id=candidate.id RETURNING l.id,l.lease_id,l.email
                """, (row, index) -> new Lease(row.getObject("id", UUID.class),
                row.getObject("lease_id", UUID.class), row.getString("email")), lease).stream().findFirst();
    }

    public void finish(UUID id, UUID lease, boolean delivered) {
        db.update("""
                UPDATE organizer_account_links SET lease_id=NULL,
                    next_attempt_at=CASE WHEN ? THEN NULL ELSE clock_timestamp()+interval '30 seconds' END
                WHERE id=? AND lease_id=? AND consumed_at IS NULL
                """, delivered, id, lease);
    }
}
