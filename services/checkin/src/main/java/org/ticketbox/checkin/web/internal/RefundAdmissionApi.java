package org.ticketbox.checkin.web.internal;

import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import org.ticketbox.checkin.admission.application.port.RefundAdmission;

import java.util.List;
import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/internal/split/refund-admission")
class RefundAdmissionApi {
    private final RefundAdmission admission;

    RefundAdmissionApi(RefundAdmission admission) {
        this.admission = admission;
    }

    @PostMapping("/{id}/hold")
    RefundAdmission.Decision hold(@PathVariable UUID id, @RequestBody List<UUID> tickets) {
        if (tickets.isEmpty() || tickets.size() > 1000 || tickets.stream().anyMatch(java.util.Objects::isNull)
                || Set.copyOf(tickets).size() != tickets.size()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        return admission.hold(id, tickets);
    }

    @PostMapping("/{id}/release")
    RefundAdmission.Decision release(@PathVariable UUID id) {
        return admission.release(id);
    }
}
