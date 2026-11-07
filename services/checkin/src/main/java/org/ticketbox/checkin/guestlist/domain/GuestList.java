package org.ticketbox.checkin.guestlist.domain;

import lombok.Getter;
import lombok.NoArgsConstructor;

import org.ticketbox.checkin.domain.BaseEntity;

import java.time.OffsetDateTime;
import java.util.UUID;

@Getter
@NoArgsConstructor
public class GuestList extends BaseEntity {

    private UUID concertId;

    private String phone;

    private String fullName;

    private String category;

    private String sponsorName;

    private String notes;

    private boolean isActive = true;

    private OffsetDateTime importedAt;

    private String batchFile;

    private OffsetDateTime checkedInAt;

    private UUID checkedInBy;

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
