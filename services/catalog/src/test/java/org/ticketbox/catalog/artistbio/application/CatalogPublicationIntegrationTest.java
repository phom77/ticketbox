package org.ticketbox.catalog.artistbio.application;

import static org.assertj.core.api.Assertions.assertThat;
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
    @MockBean private ArtistBioJobProcessor processor;

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
