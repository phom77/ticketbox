package org.ticketbox.checkin.guestlist.infrastructure.batch;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.junit.jupiter.api.Test;

import java.io.StringReader;
import java.util.Set;

class GuestListCsvSchemaTest {

    @Test
    void acceptsPartnerGuestTypeAsTheCanonicalCategory() throws Exception {
        try (CSVParser parser =
                CSVFormat.DEFAULT
                        .builder()
                        .setHeader()
                        .setSkipHeaderRecord(true)
                        .build()
                        .parse(
                                new StringReader(
                                        "phone,full_name,guest_type,sponsor_name,notes,status\n"
                                                + "0901,Guest,VVIP,Brand,,CANCELLED"))) {
            CSVRecord row = parser.getRecords().getFirst();

            assertTrue(
                    GuestListCsvSchema.missingRequiredHeaders(parser.getHeaderMap().keySet())
                            .isEmpty());
            assertEquals("VVIP", GuestListCsvSchema.value(row, "category"));
            assertEquals("CANCELLED", GuestListCsvSchema.value(row, "status"));
        }
    }

    @Test
    void reportsCanonicalNameWhenNoCategoryAliasExists() {
        assertEquals(
                Set.of("category"),
                GuestListCsvSchema.missingRequiredHeaders(
                        Set.of("phone", "full_name", "sponsor_name", "notes")));
    }
}
