package org.ticketbox.identity.organization.infrastructure.persistence;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.ticketbox.identity.organization.application.port.OrganizationStore;
import org.ticketbox.identity.organization.domain.OrganizationGrant;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Repository
class JdbcOrganizationStore implements OrganizationStore {
    private final JdbcTemplate jdbc;

    JdbcOrganizationStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public boolean insert(Organization organization) {
        return jdbc.update("""
                INSERT INTO organizations (id, name, initial_manager_id)
                VALUES (?, ?, ?) ON CONFLICT (name) DO NOTHING
                """, organization.id(), organization.name(), organization.initialManagerId()) == 1;
    }

    @Override
    public Optional<Organization> findByName(String name) {
        return jdbc.query("""
                SELECT id, name, initial_manager_id FROM organizations WHERE name = ?
                """, (rs, row) -> new Organization(rs.getObject("id", UUID.class),
                rs.getString("name"), rs.getObject("initial_manager_id", UUID.class)), name)
                .stream().findFirst();
    }

    @Override
    public List<Organization> organizations() {
        return jdbc.query("SELECT id, name, initial_manager_id FROM organizations ORDER BY name, id",
                (rs, row) -> new Organization(rs.getObject("id", UUID.class), rs.getString("name"),
                        rs.getObject("initial_manager_id", UUID.class)));
    }

    @Override
    public boolean lock(UUID organizationId) {
        return !jdbc.queryForList("SELECT id FROM organizations WHERE id = ? FOR UPDATE",
                UUID.class, organizationId).isEmpty();
    }

    @Override
    public List<Membership> memberships(UUID accountId) {
        return jdbc.query("""
                SELECT o.id, o.name, m.grants FROM organizations o
                JOIN organization_members m ON m.organization_id = o.id
                WHERE m.account_id = ? ORDER BY o.name, o.id
                """, (rs, row) -> new Membership(rs.getObject("id", UUID.class),
                rs.getString("name"), readGrants(rs)), accountId);
    }

    @Override
    public List<Member> members(UUID organizationId) {
        return jdbc.query("""
                SELECT m.account_id, m.grants, u.is_active FROM organization_members m
                JOIN users u ON u.id = m.account_id
                WHERE m.organization_id = ? ORDER BY m.account_id
                """, (rs, row) -> new Member(rs.getObject("account_id", UUID.class),
                readGrants(rs), rs.getBoolean("is_active")), organizationId);
    }

    @Override
    public Set<OrganizationGrant> grants(UUID organizationId, UUID accountId) {
        return jdbc.query("""
                SELECT grants FROM organization_members WHERE organization_id = ? AND account_id = ?
                """, (rs, row) -> readGrants(rs), organizationId, accountId)
                .stream().findFirst().orElse(Set.of());
    }

    @Override
    public void saveGrants(UUID organizationId, UUID accountId, Set<OrganizationGrant> grants) {
        if (grants.isEmpty()) {
            jdbc.update("DELETE FROM organization_members WHERE organization_id = ? AND account_id = ?",
                    organizationId, accountId);
            return;
        }
        jdbc.update("""
                INSERT INTO organization_members (organization_id, account_id, grants)
                VALUES (?, ?, string_to_array(?, ','))
                ON CONFLICT (organization_id, account_id) DO UPDATE SET grants = excluded.grants
                """, organizationId, accountId, writeGrants(grants));
    }

    @Override
    public void invalidateInvitations(UUID organizationId, UUID accountId) {
        jdbc.update("""
                DELETE FROM organization_invitations
                WHERE organization_id = ? AND account_id = ? AND consumed_at IS NULL
                """, organizationId, accountId);
    }

    @Override
    public void saveInvitation(String codeHash, Invitation invitation) {
        jdbc.update("""
                INSERT INTO organization_invitations (code_hash, organization_id, account_id, grants, expires_at)
                VALUES (?, ?, ?, string_to_array(?, ','), ?)
                """, codeHash, invitation.organizationId(), invitation.accountId(),
                writeGrants(invitation.grants()), invitation.expiresAt().atOffset(ZoneOffset.UTC));
    }

    @Override
    public Optional<Invitation> findInvitation(String codeHash) {
        return jdbc.query("""
                SELECT organization_id, account_id, grants, expires_at, consumed_at
                FROM organization_invitations WHERE code_hash = ?
                """, (rs, row) -> new Invitation(rs.getObject("organization_id", UUID.class),
                rs.getObject("account_id", UUID.class), readGrants(rs),
                rs.getObject("expires_at", OffsetDateTime.class).toInstant(),
                rs.getObject("consumed_at") != null), codeHash).stream().findFirst();
    }

    @Override
    public void consumeInvitation(String codeHash) {
        jdbc.update("UPDATE organization_invitations SET consumed_at = now() WHERE code_hash = ?", codeHash);
    }

    @Override
    public void audit(UUID organizationId, UUID actorId, UUID targetId, String action,
                      Set<OrganizationGrant> grants) {
        jdbc.update("""
                INSERT INTO organization_audit (organization_id, actor_id, target_id, action, grants)
                VALUES (?, ?, ?, ?, string_to_array(?, ','))
                """, organizationId, actorId, targetId, action, writeGrants(grants));
    }

    private Set<OrganizationGrant> readGrants(ResultSet rs) throws SQLException {
        return Arrays.stream((String[]) rs.getArray("grants").getArray())
                .map(OrganizationGrant::valueOf)
                .collect(Collectors.toUnmodifiableSet());
    }

    private String writeGrants(Set<OrganizationGrant> grants) {
        return grants.stream().map(Enum::name).sorted().collect(Collectors.joining(","));
    }
}
