package com.ticketbox.module.admin.domain;

import com.ticketbox.shared.entity.BaseEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "guest_lists")
@Getter
@NoArgsConstructor
public class GuestList extends BaseEntity {

    @Column(name = "concert_id", nullable = false)
    private UUID concertId;

    @Column(name = "phone", nullable = false, length = 20)
    private String phone;

    @Column(name = "full_name", nullable = false, length = 255)
    private String fullName;

    @Column(name = "category", length = 100)
    private String category;

    @Column(name = "sponsor_name", length = 255)
    private String sponsorName;

    @Column(name = "notes", columnDefinition = "TEXT")
    private String notes;

    @Column(name = "is_active", nullable = false)
    private boolean isActive = true;

    @CreationTimestamp
    @Column(name = "imported_at", nullable = false, updatable = false)
    private OffsetDateTime importedAt;

    @Column(name = "batch_file", length = 255)
    private String batchFile;

    @Column(name = "checked_in_at")
    private OffsetDateTime checkedInAt;

    @Column(name = "checked_in_by")
    private UUID checkedInBy;

    @Column(name = "checkin_gate", length = 100)
    private String checkinGate;

    public void setConcertId(UUID concertId) {
        this.concertId = concertId;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public void setFullName(String fullName) {
        this.fullName = fullName;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public void setSponsorName(String sponsorName) {
        this.sponsorName = sponsorName;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public void setActive(boolean active) {
        isActive = active;
    }

    public void setImportedAt(OffsetDateTime importedAt) {
        this.importedAt = importedAt;
    }

    public void setBatchFile(String batchFile) {
        this.batchFile = batchFile;
    }

    public void setCheckedInAt(OffsetDateTime checkedInAt) {
        this.checkedInAt = checkedInAt;
    }

    public void setCheckedInBy(UUID checkedInBy) {
        this.checkedInBy = checkedInBy;
    }

    public void setCheckinGate(String checkinGate) {
        this.checkinGate = checkinGate;
    }
}
