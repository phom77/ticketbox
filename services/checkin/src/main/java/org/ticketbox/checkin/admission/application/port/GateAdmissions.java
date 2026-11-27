package org.ticketbox.checkin.admission.application.port;

import java.time.OffsetDateTime;

/** Admissions recorded at one gate of a performance; a null gate means none was entered. */
public record GateAdmissions(String gate, long checkedIn, OffsetDateTime latestCheckedAt) {}
