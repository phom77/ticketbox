package com.ticketbox.module.checkin.domain;

import com.ticketbox.shared.entity.BaseEntity;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "checkin_logs")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CheckinLog extends BaseEntity {

    @Column(name = "ticket_id", nullable = false, unique = true)
    private UUID ticketId;

    @Column(name = "concert_id", nullable = false)
    private UUID concertId;

    @Column(name = "staff_id")
    private UUID staffId;

    @Column(name = "device_id", length = 255)
    private String deviceId;

    @Column(name = "checked_at", nullable = false)
    private OffsetDateTime checkedAt;

    @Column(name = "sync_at")
    private OffsetDateTime syncAt;

    @Column(name = "is_offline", nullable = false)
    private boolean isOffline = false;

    @Column(name = "gate", length = 50)
    private String gate;

    @Column(name = "notes", columnDefinition = "TEXT")
    private String notes;

    public CheckinLog(UUID ticketId, UUID concertId, UUID staffId,
                      String deviceId, OffsetDateTime checkedAt,
                      boolean isOffline, String gate) {
        this.ticketId   = ticketId;
        this.concertId  = concertId;
        this.staffId    = staffId;
        this.deviceId   = deviceId;
        this.checkedAt  = checkedAt;
        this.isOffline  = isOffline;
        this.gate       = gate;
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
