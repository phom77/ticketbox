package org.ticketbox.checkin.admission.domain;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import org.ticketbox.checkin.domain.BaseEntity;

import java.time.OffsetDateTime;
import java.util.UUID;

@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CheckinLog extends BaseEntity {

    private UUID ticketId;

    private UUID concertId;

    private UUID staffId;

    private String deviceId;

    private OffsetDateTime checkedAt;

    private OffsetDateTime syncAt;

    private boolean isOffline = false;

    private String gate;

    private String notes;

    public CheckinLog(
            UUID ticketId,
            UUID concertId,
            UUID staffId,
            String deviceId,
            OffsetDateTime checkedAt,
            boolean isOffline,
            String gate) {
        this.ticketId = ticketId;
        this.concertId = concertId;
        this.staffId = staffId;
        this.deviceId = deviceId;
        this.checkedAt = checkedAt;
        this.isOffline = isOffline;
        this.gate = gate;
    }

    public void setTicketId(UUID ticketId) {
        this.ticketId = ticketId;
    }

    public void setConcertId(UUID concertId) {
        this.concertId = concertId;
    }

    public void setStaffId(UUID staffId) {
        this.staffId = staffId;
    }

    public void setDeviceId(String deviceId) {
        this.deviceId = deviceId;
    }

    public void setCheckedAt(OffsetDateTime checkedAt) {
        this.checkedAt = checkedAt;
    }

    public void setSyncAt(OffsetDateTime syncAt) {
        this.syncAt = syncAt;
    }

    public void setOffline(boolean isOffline) {
        this.isOffline = isOffline;
    }

    public void setGate(String gate) {
        this.gate = gate;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }
}
