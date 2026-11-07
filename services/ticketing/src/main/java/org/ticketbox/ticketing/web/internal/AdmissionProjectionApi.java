package org.ticketbox.ticketing.web.internal;

import jakarta.validation.Valid;

import org.springframework.web.bind.annotation.*;
import org.ticketbox.ticketing.application.port.AdmissionFeedback;

@RestController
public class AdmissionProjectionApi {
    private final AdmissionFeedback feedback;

    public AdmissionProjectionApi(AdmissionFeedback feedback) {
        this.feedback = feedback;
    }

    @PostMapping("/internal/split/admissions")
    public void project(@Valid @RequestBody AdmissionFeedback.Admission admission) {
        feedback.project(admission);
    }
}
