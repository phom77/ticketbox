package org.ticketbox.catalog.sales.web;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.ticketbox.catalog.sales.application.TicketTypeService;
import org.ticketbox.catalog.sales.application.dto.CreateTicketTypeRequest;
import org.ticketbox.catalog.sales.application.dto.TicketTypeResponse;
import org.ticketbox.catalog.sales.application.dto.UpdateTicketTypeRequest;
import org.ticketbox.catalog.sales.application.dto.UpdateTicketTypeStatusRequest;
import org.ticketbox.catalog.web.ApiResponse;
import org.ticketbox.catalog.web.security.OrganizationAccess;
import org.ticketbox.catalog.web.security.OrganizerPermission;

import java.util.List;
import java.util.UUID;

@RestController
@OrganizerPermission(OrganizerPermission.Grant.EVENTS)
@RequestMapping("/api/organizer/manage")
@RequiredArgsConstructor
public class OrganizerTicketTypeController {

    private final TicketTypeService ticketTypeService;

    @GetMapping("/concerts/{concertId}/ticket-types")
    public ResponseEntity<ApiResponse<List<TicketTypeResponse>>> list(
            @PathVariable UUID concertId, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organizationId) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        ticketTypeService.getTicketTypesForAdmin(
                                concertId, organizationId, false)));
    }

    @PostMapping("/concerts/{concertId}/ticket-types")
    public ResponseEntity<ApiResponse<TicketTypeResponse>> create(
            @PathVariable UUID concertId,
            @Valid @RequestBody CreateTicketTypeRequest request,
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organizationId) {
        TicketTypeResponse created =
                ticketTypeService.createTicketType(
                        concertId, request, organizationId, false);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(created));
    }

    @PutMapping("/ticket-types/{id}")
    public ResponseEntity<ApiResponse<TicketTypeResponse>> update(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateTicketTypeRequest request,
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organizationId) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        ticketTypeService.updateTicketType(
                                id, request, organizationId, false)));
    }

    @PatchMapping("/ticket-types/{id}/status")
    public ResponseEntity<ApiResponse<TicketTypeResponse>> changeStatus(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateTicketTypeStatusRequest request,
            @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organizationId) {
        return ResponseEntity.ok(
                ApiResponse.success(
                        ticketTypeService.changeStatus(
                                id, request.isActive(), organizationId, false)));
    }

    @DeleteMapping("/ticket-types/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(
            @PathVariable UUID id, @RequestAttribute(OrganizationAccess.ORGANIZATION) UUID organizationId) {
        ticketTypeService.deleteTicketType(id, organizationId, false);
        return ResponseEntity.ok(ApiResponse.success(null));
    }
}
