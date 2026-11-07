package org.ticketbox.checkin.guestlist.domain;

public class PhoneNormalizer {
    public String normalize(String phone) {
        try {
            return new PhoneNumber(phone).value();
        } catch (IllegalArgumentException invalid) {
            return null;
        }
    }
}
