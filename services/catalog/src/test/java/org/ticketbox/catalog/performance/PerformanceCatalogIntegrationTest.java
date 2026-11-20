package org.ticketbox.catalog.performance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.http.HttpMethod.PUT;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClient;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.domain.DomainViolation;
import org.ticketbox.catalog.performance.application.PerformanceCatalog;
import org.ticketbox.catalog.performance.domain.PerformanceLayout;
import org.ticketbox.catalog.performance.domain.PerformanceLayout.Kind;
import org.ticketbox.catalog.performance.domain.PerformanceLayout.Point;
import org.ticketbox.catalog.performance.domain.PerformanceSale;
import org.ticketbox.catalog.performance.infrastructure.JdbcPerformanceStore;
import org.ticketbox.catalog.performance.infrastructure.PerformancePublisher;

@Testcontainers
class PerformanceCatalogIntegrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");
    private static final String TICKETING = "http://ticketing/internal/ticketing/catalog/performances/";
    private static final String CHECKIN = "http://checkin/internal/checkin/catalog/performances/";

    private static JdbcTemplate jdbc;
    private static TransactionTemplate transaction;
    private static ObjectMapper json;
    private static PerformanceCatalog catalog;
    private UUID owner;
    private UUID event;
    private UUID venue;
    private UUID space;

    @BeforeAll
    static void migrate() {
        var source = new DriverManagerDataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        Flyway.configure().dataSource(source).load().migrate();
        jdbc = new JdbcTemplate(source);
        transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
        json = new ObjectMapper().findAndRegisterModules().disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        catalog = new PerformanceCatalog(new JdbcPerformanceStore(jdbc, json));
    }

    @BeforeEach
    void draftEvent() {
        jdbc.update("UPDATE performance_sale_publications SET ticketing_ack=true, checkin_ack=true");
        owner = UUID.randomUUID();
        event = tx(() -> catalog.createEvent(owner, "Two nights", "Tour", "music")).id();
        var created = tx(() -> catalog.createVenue(owner, "Room", "Address", "Stage"));
        venue = created.id();
        space = created.spaces().getFirst().id();
    }

    @Test
    void requiresMatchingTicketingAcknowledgmentAndExposesOnlyTheRightPerformance() {
        var night = newPerformance(3);
        var draft = newPerformance(4);
        tx(() -> catalog.saveSale(owner, owner, night.id(), 0, maplessSale(night.saleStartAt(), night.saleEndAt())));
        assertThatThrownBy(() -> tx(() -> catalog.publish(owner, owner, night.id(), 0L, 0L)))
                .isInstanceOf(AppException.class).hasMessage("error.performance.version-conflict");
        var publication = tx(() -> catalog.publish(owner, owner, night.id(), 1L, 0L));
        assertThat(publication.saleVersion()).isEqualTo(2);
        assertThatThrownBy(() -> catalog.event(event, null)).isInstanceOf(AppException.class);
        assertThatThrownBy(() -> tx(() -> catalog.publication(UUID.randomUUID(), night.id())))
                .isInstanceOf(AppException.class);

        RestClient.Builder client = RestClient.builder();
        var receivers = MockRestServiceServer.bindTo(client).build();
        var publisher = new PerformancePublisher(jdbc, client.build(), json, "http://ticketing", "http://checkin");
        receivers.expect(requestTo(TICKETING + night.id())).andExpect(method(PUT))
                .andExpect(jsonPath("$.saleStartAt").isString()).andExpect(jsonPath("$.groups[1].kind").value("GA"))
                .andRespond(withSuccess("{\"version\":1}", MediaType.APPLICATION_JSON));
        receivers.expect(requestTo(CHECKIN + night.id())).andRespond(withServerError());
        publisher.publish();
        receivers.verify();
        assertThatThrownBy(() -> catalog.event(event, null)).isInstanceOf(AppException.class);
        assertThat(tx(() -> catalog.publication(owner, night.id())).ticketingAcknowledged()).isFalse();

        jdbc.update("""
                UPDATE performance_sale_publications SET ticketing_retry_at=now(),checkin_retry_at=now()
                WHERE performance_id=?
                """, night.id());
        receivers.reset();
        receivers.expect(requestTo(TICKETING + night.id()))
                .andRespond(withSuccess("{\"version\":2}", MediaType.APPLICATION_JSON));
        receivers.expect(requestTo(CHECKIN + night.id())).andRespond(withServerError());
        publisher.publish();
        receivers.verify();
        assertThat(tx(() -> catalog.publication(owner, night.id())).checkinAcknowledged()).isFalse();
        assertThat(catalog.event(event, null).performances()).extracting("id").containsExactly(night.id());
        assertThat(catalog.event(event, owner).performances()).extracting("id").containsExactly(night.id(), draft.id());
        assertThat(catalog.events(null, PageRequest.of(0, 10)).getContent()).extracting("id").contains(event);
    }

    @Test
    void templateCopiesHaveIndependentRevisionsAndPublishedSeatLabelsAreFrozen() {
        var night = newPerformance(3);
        var another = newPerformance(4);
        var source = assignedLayout();
        var template = tx(() -> catalog.createTemplate(owner, venue, space, "Original", source));
        var firstCopy = tx(() -> catalog.copyTemplate(owner, night.id(), template.id(), 1, 0));
        var secondCopy = tx(() -> catalog.copyTemplate(owner, another.id(), template.id(), 1, 0));
        assertThat(firstCopy.layout()).isEqualTo(secondCopy.layout());
        assertThatThrownBy(() -> tx(() -> catalog.saveLayout(owner, night.id(), 0, source)))
                .isInstanceOf(AppException.class).hasMessage("error.performance.version-conflict");

        var section = source.sections().getFirst();
        var seat = section.rows().getFirst().seats().getFirst();
        var group = new PerformanceSale.Group(UUID.randomUUID(), section.id(), section.label(), Kind.ASSIGNED, 1,
                List.of(new PerformanceSale.Seat(seat.id(), "Row A", "Seat 1", false)));
        var offer = standard(group.id(), night.saleStartAt(), night.saleEndAt());
        tx(() -> catalog.saveSale(owner, owner, night.id(), 0, new PerformanceSale(List.of(group), List.of(offer))));
        tx(() -> catalog.publish(owner, owner, night.id(), 1L, 1L));
        jdbc.update("UPDATE performance_sale_publications SET ticketing_ack=true WHERE performance_id=?", night.id());
        tx(() -> catalog.reviseTemplate(owner, venue, template.id(), 1,
                new PerformanceLayout(600, 600, null, List.of(), List.of())));
        assertThatThrownBy(() -> tx(() -> catalog.saveLayout(owner, night.id(), 1, source)))
                .isInstanceOf(AppException.class).hasMessage("error.performance.layout-locked");
        assertThat(catalog.layoutOverview(night.id()).sections()).containsExactly(section.summary());
        assertThat(catalog.layoutSection(night.id(), section.id()).section().rows().getFirst().seats())
                .containsExactly(seat);
        assertThatThrownBy(() -> catalog.layoutOverview(another.id())).isInstanceOf(AppException.class);

        var revisedOffer = new PerformanceSale.Offer(offer.id(), offer.groupId(), offer.name(),
                BigDecimal.valueOf(200_000), offer.currency(), offer.saleStartAt(), offer.saleEndAt(), true);
        var revised = tx(() -> catalog.saveSale(owner, owner, night.id(), 2,
                new PerformanceSale(List.of(group), List.of(revisedOffer))));
        assertThat(revised.version()).isEqualTo(3);
        assertThat(jdbc.queryForObject("""
                SELECT count(DISTINCT payload->>'layoutChecksum') FROM performance_sale_publications WHERE performance_id=?
                """, Integer.class, night.id())).isEqualTo(1);
    }

    @Test
    void rejectsUnsafeLayoutGeometryAndInvalidOfferWindows() {
        var night = newPerformance(3);
        var source = assignedLayout();
        var section = source.sections().getFirst();
        var row = section.rows().getFirst();
        var seat = new PerformanceLayout.Seat(UUID.randomUUID(), "Outside", 59, 59, false, false, null, null, false);
        var outside = new PerformanceLayout.Section(section.id(), section.code(), section.label(), Kind.ASSIGNED,
                section.points(), List.of(new PerformanceLayout.Row(row.id(), row.code(), row.label(), List.of(seat))));
        assertThatThrownBy(() -> tx(() -> catalog.saveLayout(owner, night.id(), 0,
                new PerformanceLayout(60, 60, null, List.of(), List.of(outside)))))
                .isInstanceOf(DomainViolation.class).hasMessage("error.performance.seat-outside-section");
        assertThat(tx(() -> catalog.draftLayout(owner, night.id())).version()).isZero();
        assertThatThrownBy(() -> tx(() -> catalog.saveSale(owner, owner, night.id(), 0,
                maplessSale(night.saleStartAt().minusDays(1), night.saleEndAt()))))
                .isInstanceOf(DomainViolation.class).hasMessage("error.performance.invalid-offer-window");
        assertThat(tx(() -> catalog.sale(owner, night.id())).version()).isZero();
    }

    @Test
    void catalogPreventsAnOfferFromReferencingAnotherPerformancesStock() {
        var one = newPerformance(3);
        var two = newPerformance(4);
        var sale = maplessSale(one.saleStartAt(), one.saleEndAt());
        tx(() -> catalog.saveSale(owner, owner, one.id(), 0, sale));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM performance_sale_offers WHERE performance_id=?",
                Integer.class, one.id())).isEqualTo(2);
        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO performance_sale_offers(
                    id,performance_id,group_id,name,price,currency,sale_start_at,sale_end_at,active,sort_index)
                VALUES (?,?,?,'Cross scope',1,'VND',?,?,true,0)
                """, UUID.randomUUID(), two.id(), sale.groups().getFirst().id(), two.saleStartAt(), two.saleEndAt()))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }

    private org.ticketbox.catalog.performance.application.PerformanceViews.Performance newPerformance(int days) {
        var starts = OffsetDateTime.now(ZoneOffset.UTC).plusDays(days).withNano(0);
        var schedule = new PerformanceCatalog.Schedule(space, starts, starts.plusHours(2), starts.minusHours(1),
                "Asia/Ho_Chi_Minh", starts.minusDays(2), starts.minusHours(2), 4, true);
        return tx(() -> catalog.createPerformance(owner, event, schedule));
    }

    private static PerformanceSale maplessSale(OffsetDateTime start, OffsetDateTime end) {
        var one = new PerformanceSale.Group(UUID.randomUUID(), null, "Floor", Kind.GA, 250, List.of());
        var two = new PerformanceSale.Group(UUID.randomUUID(), null, "Balcony", Kind.GA, 40, List.of());
        return new PerformanceSale(List.of(one, two), List.of(standard(one.id(), start, end),
                standard(two.id(), start, end)));
    }

    private static PerformanceSale.Offer standard(UUID pool, OffsetDateTime start, OffsetDateTime end) {
        return new PerformanceSale.Offer(UUID.randomUUID(), pool, "Standard", BigDecimal.valueOf(100_000),
                "VND", start, end, true);
    }

    private static PerformanceLayout assignedLayout() {
        var bounds = List.of(new Point(10, 10), new Point(50, 10), new Point(50, 50), new Point(10, 50));
        var seat = new PerformanceLayout.Seat(UUID.randomUUID(), "Seat 1", 25, 25, true, false, "front", 0, false);
        var row = new PerformanceLayout.Row(UUID.randomUUID(), "A", "Row A", List.of(seat));
        var section = new PerformanceLayout.Section(UUID.randomUUID(), "A", "Section A", Kind.ASSIGNED,
                bounds, List.of(row));
        return new PerformanceLayout(60, 60, null, List.of(), List.of(section));
    }

    private static <T> T tx(Supplier<T> action) {
        return transaction.execute(status -> action.get());
    }
}
