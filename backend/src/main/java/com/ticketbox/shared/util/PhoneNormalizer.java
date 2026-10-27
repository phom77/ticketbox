package com.ticketbox.shared.util;

import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

@Component
public class PhoneNormalizer {

    private static final Pattern PRESENTATION_CHARACTERS = Pattern.compile("[\\s.\\-()]");
    private static final Pattern VALID_PHONE = Pattern.compile("\\+?\\d+");

    public String normalize(String phone) {
        if (phone == null) {
            return null;
        }

        String normalized = PRESENTATION_CHARACTERS.matcher(phone.trim()).replaceAll("");
        if (normalized.isEmpty() || normalized.length() > 20 || !VALID_PHONE.matcher(normalized).matches()) {
            return null;
        }
        return normalized;
    }
}
