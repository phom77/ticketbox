package org.ticketbox.checkin.admission.web;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.ticketbox.checkin.admission.application.StaffAdmission;
import org.ticketbox.checkin.admission.application.port.StaffAssignments;
import org.ticketbox.checkin.web.ApiResponse;
import org.ticketbox.checkin.web.security.OrganizationAccess;
import org.ticketbox.checkin.web.security.OrganizerPermission;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/organizer/manage/v2/performances/{id}/staff")
@OrganizerPermission(OrganizerPermission.Grant.EVENTS)
class StaffAssignmentController {
    private final StaffAdmission admission;

    StaffAssignmentController(StaffAdmission admission) {
        this.admission = admission;
    }

    @GetMapping
    ApiResponse<List<StaffAssignments.Assignment>> list(
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organization, @PathVariable UUID id) {
        return ApiResponse.success(admission.assignments(organization, id));
    }

    @PutMapping("/{staffId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void grant(@RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organization,
               @PathVariable UUID id, @PathVariable UUID staffId, Authentication auth) {
        admission.grant(organization, id, staffId, UUID.fromString(auth.getName()));
    }

    @DeleteMapping("/{staffId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void revoke(@RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organization,
                @PathVariable UUID id, @PathVariable UUID staffId, Authentication auth) {
        admission.revoke(organization, id, staffId, UUID.fromString(auth.getName()));
    }
}
