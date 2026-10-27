package com.ticketbox.module.admin.infrastructure.batch;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

@Getter
@Setter
@ToString
public class GuestListRow {
    private String concertId;
    private String phone;
    private String fullName;
    private String category;
    private String sponsorName;
    private String notes;
}
