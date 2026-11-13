package org.ticketbox.catalog.artistbio.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.modulith.events.IncompleteEventPublications;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.UUID;
import java.time.OffsetDateTime;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.ticketbox.catalog.concert.application.ConcertService;
import org.ticketbox.catalog.concert.application.dto.CreateConcertRequest;
import org.ticketbox.catalog.concert.application.dto.UpdateConcertRequest;

@Testcontainers
@SpringBootTest(
        properties = {
            "ticketbox.security.jwt.secret=catalog-integration-fixture-secret-at-least-sixty-four-characters",
            "split.token=catalog-integration-fixture-service-token",
            "split.ticketing-url=http://127.0.0.1:1",
            "split.checkin-url=http://127.0.0.1:1",
            "split.config-interval-ms=3600000",
            "split.stock-interval-ms=3600000",
            "ticketbox.ai.recovery.fixed-delay-ms=3600000"
        })
class CatalogPublicationIntegrationTest {
    @Container
    private static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.flyway.user", POSTGRES::getUsername);
        registry.add("spring.flyway.password", POSTGRES::getPassword);
    }

    @Autowired private JdbcTemplate jdbc;
    @Autowired private IncompleteEventPublications publications;
    @Autowired private ConcertService concerts;
    @Autowired private ObjectMapper json;
    @MockBean private ArtistBioJobProcessor processor;
    @MockBean private org.ticketbox.catalog.sales.infrastructure.CatalogPublisher catalogPublisher;

    @Test
    void persistsOptionalTranslationsAndPreservesThemForLegacyEdits() throws Exception {
        UUID organization = UUID.randomUUID();
        UUID actor = UUID.randomUUID();
        String fields = """
                "venueName":"Hall","venueAddress":"Main street","eventDate":"%s","saleStartAt":"%s"
                """.formatted(OffsetDateTime.now().plusDays(10), OffsetDateTime.now().plusDays(1));
        var created = concerts.createConcert(json.readValue("""
                {"translations":{"en":{"title":"Summer show"},"vi":{"description":"Mô tả"}} ,%s}
                """.formatted(fields), CreateConcertRequest.class), actor, organization);

        var preview = json.valueToTree(concerts.preview(created.id(), organization));
        assertThat(preview.at("/translations/en/title").asText()).isEqualTo("Summer show");
        assertThat(preview.at("/translations/vi/description").asText()).isEqualTo("Mô tả");
        assertThat(preview.path("title").asText()).isEqualTo("Summer show");

        var legacyEdit = json.readValue("""
                {"title":"Original show",%s}
                """.formatted(fields), UpdateConcertRequest.class);
        assertThatThrownBy(() -> concerts.updateConcert(created.id(), legacyEdit, UUID.randomUUID(), false))
                .isInstanceOf(RuntimeException.class);
        var legacyResult = json.valueToTree(concerts.updateConcert(created.id(), legacyEdit, organization, false));
        assertThat(legacyResult.at("/translations/en/title").asText()).isEqualTo("Summer show");
        assertThat(legacyResult.path("title").asText()).isEqualTo("Original show");

        var clearEnglish = json.readValue("""
                {"translations":{"en":{"title":null,"description":null}},%s}
                """.formatted(fields), UpdateConcertRequest.class);
        concerts.updateConcert(created.id(), clearEnglish, organization, false);
        var updated = json.valueToTree(concerts.preview(created.id(), organization));
        assertThat(updated.at("/translations/en").isMissingNode()).isTrue();
        assertThat(updated.at("/translations/vi/description").asText()).isEqualTo("Mô tả");
        assertThat(updated.path("title").asText()).isEqualTo("Original show");
    }

    @Test
    void requiresOneTitleAndAllowsVietnameseOnly() throws Exception {
        String fields = """
                "venueName":"Hall","venueAddress":"Main street","eventDate":"%s","saleStartAt":"%s"
                """.formatted(OffsetDateTime.now().plusDays(10), OffsetDateTime.now().plusDays(1));
        UUID actor = UUID.randomUUID();
        UUID organization = UUID.randomUUID();
        var created = concerts.createConcert(json.readValue("""
                {"translations":{"vi":{"title":"Đêm nhạc"}},%s}
                """.formatted(fields), CreateConcertRequest.class), actor, organization);
        var invalidEdit = json.readValue("""
                {"translations":{"vi":{"title":" "}},%s}
                """.formatted(fields), UpdateConcertRequest.class);
        assertThatThrownBy(() -> concerts.updateConcert(created.id(), invalidEdit, organization, false))
                .hasMessage("validation.concert.title-required");
        assertThat(concerts.preview(created.id(), organization).title()).isEqualTo("Đêm nhạc");
    }

    @Test
    void pendingPublicationFromBaselineIsReplayedAndCompleted() {
        UUID publication = UUID.randomUUID();
        UUID job = UUID.randomUUID();
        String event = "com.ticketbox.module.ai.application.ArtistBioJobSubmittedEvent";
        String listener =
                "com.ticketbox.module.ai.application.ArtistBioJobEventListener.onSubmitted("
                        + event
                        + ")";
        jdbc.update(
                """
INSERT INTO event_publication (id, listener_id, event_type, serialized_event, publication_date)
VALUES (?, ?, ?, ?, now())
""",
                publication,
                listener,
                event,
                "{\"jobId\":\"" + job + "\"}");

        publications.resubmitIncompletePublications(
                candidate -> candidate.getIdentifier().equals(publication));

        await().untilAsserted(
                        () -> {
                            verify(processor).process(job);
                            assertThat(
                                            jdbc.queryForObject(
                                                    """
SELECT completion_date IS NOT NULL FROM event_publication WHERE id=?
""",
                                                    Boolean.class,
                                                    publication))
                                    .isTrue();
                        });
    }

    @Autowired private org.ticketbox.catalog.artistbio.application.port.ArtistPdfJobRepository jobs;

    @Test
    void jobSearchPreservesOwnershipAndStatusFilters() {
        UUID concert = UUID.fromString("10000000-0000-0000-0000-000000000001");
        var job =
                jobs.save(
                        new org.ticketbox.catalog.artistbio.domain.ArtistPdfJob(
                                concert,
                                "https://example.test/artist.pdf",
                                "artist.pdf",
                                UUID.fromString("00000000-0000-0000-0000-000000000001"),
                                "ownership-fixture"));
        var page = org.springframework.data.domain.PageRequest.of(0, 20);
        assertThat(jobs.search(concert, java.util.List.of(), null, page)).isEmpty();
        assertThat(jobs.search(concert, java.util.List.of(UUID.randomUUID()), null, page))
                .isEmpty();
        assertThat(jobs.search(concert, java.util.List.of(concert), job.getStatus(), page))
                .extracting(org.ticketbox.catalog.artistbio.domain.ArtistPdfJob::getId)
                .contains(job.getId());
        assertThat(
                        jobs.search(
                                concert,
                                null,
                                org.ticketbox.catalog.artistbio.domain.ArtistPdfJob.Status.DONE,
                                page))
                .isEmpty();
        assertThat(jobs.search(concert, null, null, page))
                .extracting(org.ticketbox.catalog.artistbio.domain.ArtistPdfJob::getId)
                .contains(job.getId());
    }
}
