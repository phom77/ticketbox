package org.ticketbox.catalog.sales;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.ticketbox.catalog.performance.application.PerformanceViews.SaleSnapshot;

/** The sale snapshot Catalog serializes only uses properties of the published contract. */
class SaleSnapshotContractTest {
    private static final ObjectMapper JSON =
            new ObjectMapper().findAndRegisterModules().disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    private static JsonNode schema() throws Exception {
        var directory = Path.of("").toAbsolutePath();
        while (directory != null && !Files.exists(directory.resolve("contracts/catalog.performance-sale-snapshot.v2.json"))) {
            directory = directory.getParent();
        }
        assertThat(directory).as("repository root with contracts/").isNotNull();
        return JSON.readTree(directory.resolve("contracts/catalog.performance-sale-snapshot.v2.json").toFile());
    }

    @Test
    void classificationFieldsAreOptionalNullableAdditions() throws Exception {
        var schema = schema();
        var required = new HashSet<String>();
        schema.path("required").forEach(name -> required.add(name.asText()));
        for (String field : List.of("segment", "primaryGenre", "city")) {
            assertThat(schema.path("properties").has(field)).as(field).isTrue();
            assertThat(required).doesNotContain(field);
            var types = new HashSet<String>();
            schema.path("properties").path(field).path("type").forEach(type -> types.add(type.asText()));
            assertThat(types).containsExactlyInAnyOrder("string", "null");
        }
        assertThat(schema.has("additionalProperties")).isFalse();
    }

    @Test
    void serializedSnapshotsUseOnlyContractPropertiesWithAndWithoutClassification() throws Exception {
        var properties = new HashSet<String>();
        schema().path("properties").fieldNames().forEachRemaining(properties::add);
        for (var snapshot : List.of(snapshot("concerts", "vpop", "Hanoi"), snapshot(null, null, null))) {
            var node = JSON.valueToTree(snapshot);
            Set<String> names = new HashSet<>();
            node.fieldNames().forEachRemaining(names::add);
            assertThat(properties).containsAll(names);
        }
        assertThat(JSON.valueToTree(snapshot("concerts", "vpop", "Hanoi")).path("primaryGenre").asText()).isEqualTo("vpop");
    }

    private static SaleSnapshot snapshot(String segment, String genre, String city) {
        return new SaleSnapshot(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), 1, null, null, "Show", "Hall",
                OffsetDateTime.now(), OffsetDateTime.now().plusHours(2), null, "Asia/Ho_Chi_Minh", OffsetDateTime.now(),
                OffsetDateTime.now().plusDays(1), "ON_SALE", false, null, true, 4, null, List.of(), List.of(), segment,
                genre, city);
    }
}
