package org.ticketbox.checkin.web.internal;

import com.fasterxml.jackson.databind.JsonNode;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.ticketbox.checkin.application.error.AppException;
import org.ticketbox.checkin.application.error.ErrorCode;
import org.ticketbox.checkin.application.port.ProjectionSnapshots;
import org.ticketbox.checkin.application.port.catalog.PerformanceAdmissionSnapshot;

import java.util.UUID;

@RestController
@RequestMapping("/internal/checkin")
class PerformanceProjectionApi {
    private final ProjectionSnapshots receiver;

    PerformanceProjectionApi(ProjectionSnapshots receiver) {
        this.receiver = receiver;
    }

    @PutMapping("/catalog/performances/{id}")
    Acknowledgment performance(@PathVariable UUID id, @Valid @RequestBody PerformanceAdmissionSnapshot snapshot) {
        if (!id.equals(snapshot.id())) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.invalid-request");
        }
        return new Acknowledgment(receiver.performance(snapshot));
    }

    @PutMapping("/tickets/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void ticket(@PathVariable UUID id, @RequestBody JsonNode snapshot) {
        receiver.performanceTicket(id, snapshot);
    }

    record Acknowledgment(long version) {}
}
