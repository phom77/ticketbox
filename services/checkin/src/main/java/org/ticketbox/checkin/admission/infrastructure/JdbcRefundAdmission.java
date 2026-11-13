package org.ticketbox.checkin.admission.infrastructure;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.checkin.admission.application.port.RefundAdmission;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Component
public class JdbcRefundAdmission implements RefundAdmission {
    private final JdbcTemplate db;

    public JdbcRefundAdmission(JdbcTemplate db) {
        this.db = db;
    }

    @Transactional
    public Decision hold(UUID caseId, List<UUID> ticketIds) {
        String ids = ticketIds.stream().distinct().sorted().map(UUID::toString)
                .collect(Collectors.joining(",", "{", "}"));
        db.update("INSERT INTO checkin_refund_cases(id,ticket_ids,state) VALUES (?,?::uuid[],'PENDING')"
                + " ON CONFLICT (id) DO NOTHING", caseId, ids);
        var current = db.queryForMap("SELECT ticket_ids=?::uuid[] AS matches,state FROM checkin_refund_cases WHERE id=? FOR UPDATE", ids, caseId);
        if ("RELEASED".equals(current.get("state"))) return Decision.RELEASED;
        if (!Boolean.TRUE.equals(current.get("matches"))) return Decision.CONFLICT;
        if (!"PENDING".equals(current.get("state"))) return Decision.valueOf(current.get("state").toString());

        var tickets = db.queryForList("SELECT status, refund_case_id FROM tickets WHERE id=ANY(?::uuid[]) ORDER BY id FOR UPDATE", ids);
        if (tickets.size() != ticketIds.size()) return Decision.NOT_SYNCED;
        if (tickets.stream().anyMatch(ticket -> !"VALID".equals(ticket.get("status")))) return Decision.ALREADY_USED;
        if (tickets.stream().anyMatch(ticket -> ticket.get("refund_case_id") != null)) return Decision.CONFLICT;
        db.update("UPDATE tickets SET refund_case_id=? WHERE id=ANY(?::uuid[])", caseId, ids);
        db.update("UPDATE checkin_refund_cases SET state='HELD' WHERE id=?", caseId);
        return Decision.HELD;
    }

    @Transactional
    public Decision release(UUID caseId) {
        db.update("INSERT INTO checkin_refund_cases(id,ticket_ids,state) VALUES (?,'{}','RELEASED')"
                + " ON CONFLICT(id) DO UPDATE SET state='RELEASED'", caseId);
        db.update("UPDATE tickets SET refund_case_id=NULL WHERE refund_case_id=?", caseId);
        return Decision.RELEASED;
    }
}
