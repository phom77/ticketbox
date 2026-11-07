package org.ticketbox.checkin.guestlist.domain;

import java.util.regex.Pattern;

public record PhoneNumber(String value) {
    private static final Pattern PRESENTATION = Pattern.compile("[\\s.\\-()]");
    private static final Pattern VALID = Pattern.compile("\\+?\\d+");

    public PhoneNumber {
        if (value == null) throw new IllegalArgumentException("Phone number is required");
        value = PRESENTATION.matcher(value.trim()).replaceAll("");
        if (value.isEmpty() || value.length() > 20 || !VALID.matcher(value).matches()) {
            throw new IllegalArgumentException("Invalid phone number");
        }
    }
}
