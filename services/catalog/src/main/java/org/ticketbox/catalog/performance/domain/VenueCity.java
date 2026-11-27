package org.ticketbox.catalog.performance.domain;

import java.util.regex.Pattern;

/**
 * Best-effort venue city until venues carry their own: the last comma-separated part of the address, without a
 * trailing country. Mirrors the city shown in discovery.
 */
public final class VenueCity {
    public static final int MAX_LENGTH = 120;
    private static final Pattern COUNTRY = Pattern.compile("\\s*,\\s*vi.t\\s*nam\\s*$",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    private static final Pattern LAST_PART = Pattern.compile("([^,]+)$");

    private VenueCity() {}

    /** The city of an address, or null when the address has no comma or no usable last part. */
    public static String of(String address) {
        if (address == null || address.indexOf(',') < 0) return null;
        var matcher = LAST_PART.matcher(COUNTRY.matcher(address).replaceAll(""));
        if (!matcher.find()) return null;
        String city = matcher.group(1).strip();
        if (city.isEmpty()) return null;
        return city.length() > MAX_LENGTH ? city.substring(0, MAX_LENGTH) : city;
    }
}
