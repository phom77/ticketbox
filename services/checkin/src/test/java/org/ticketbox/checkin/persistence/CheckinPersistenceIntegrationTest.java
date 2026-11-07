package org.ticketbox.checkin.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.ticketbox.checkin.guestlist.application.port.BatchLogRepository;
import org.ticketbox.checkin.guestlist.application.port.GuestListRepository;
import org.ticketbox.checkin.guestlist.domain.BatchLog;
import org.ticketbox.checkin.guestlist.domain.GuestList;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Testcontainers
@DataJpaTest(properties = "spring.jpa.hibernate.ddl-auto=validate")
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class CheckinPersistenceIntegrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.flyway.user", POSTGRES::getUsername);
        registry.add("spring.flyway.password", POSTGRES::getPassword);
    }

    @Autowired GuestListRepository guests;
    @Autowired BatchLogRepository batches;

    @Test
    void externalMappingPreservesConditionalAdmission() {
        UUID concert = UUID.fromString("10000000-0000-0000-0000-000000000001");
        GuestList guest = new GuestList();
        guest.setConcertId(concert);
        guest.setPhone("0901234567");
        guest.setFullName("Khách kiểm tra");
        guest.setCategory("INVITED");
        guest.setImportedAt(OffsetDateTime.now());
        guests.save(guest);
        guests.flush();
        assertThat(guest.getId()).isNotNull();
        assertThat(guest.getCreatedAt()).isNotNull();
        UUID staff = UUID.randomUUID();
        assertThat(
                        guests.checkInIfEligible(
                                guest.getId(), concert, staff, "A", OffsetDateTime.now()))
                .isOne();
        assertThat(
                        guests.checkInIfEligible(
                                guest.getId(), concert, staff, "B", OffsetDateTime.now()))
                .isZero();
    }

    @Test
    void batchSearchPreservesOwnershipAndFilters() {
        UUID concert = UUID.fromString("10000000-0000-0000-0000-000000000001");
        BatchLog log = new BatchLog();
        log.setJobName("GUEST_LIST_IMPORT");
        log.setConcertId(concert);
        log.setStartedAt(OffsetDateTime.now());
        log.setStatus(BatchLog.Status.SUCCESS);
        log.setSource(BatchLog.Source.UPLOAD);
        batches.saveAndFlush(log);
        var page = PageRequest.of(0, 20);
        assertThat(batches.search(concert, List.of(), null, null, page)).isEmpty();
        assertThat(batches.search(concert, List.of(UUID.randomUUID()), null, null, page)).isEmpty();
        assertThat(
                        batches.search(
                                concert,
                                List.of(concert),
                                BatchLog.Status.SUCCESS,
                                BatchLog.Source.UPLOAD,
                                page))
                .extracting(BatchLog::getId)
                .containsExactly(log.getId());
        assertThat(batches.search(concert, null, BatchLog.Status.FAILED, null, page)).isEmpty();
        assertThat(batches.search(concert, null, null, null, page)).hasSize(1);
    }
}
