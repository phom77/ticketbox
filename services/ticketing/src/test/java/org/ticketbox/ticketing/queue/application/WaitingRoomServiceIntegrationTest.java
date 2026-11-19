package org.ticketbox.ticketing.queue.application;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ZSetOperations.TypedTuple;
import org.springframework.test.util.ReflectionTestUtils;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.ticketbox.ticketing.application.port.catalog.ConcertOrderPort;
import org.ticketbox.ticketing.application.port.catalog.ConcertView;
import org.ticketbox.ticketing.config.RateLimitProperties;
import org.ticketbox.ticketing.infrastructure.redis.RedisConfig;
import org.ticketbox.ticketing.infrastructure.redis.RedisReadCache;
import org.ticketbox.ticketing.infrastructure.redis.TokenBucketRateLimiter;
import org.ticketbox.ticketing.queue.application.dto.QueueStatusResponse;
import org.ticketbox.ticketing.queue.application.port.AdmissionHealth.Path;
import org.ticketbox.ticketing.queue.application.port.DispatchBacklog;
import org.ticketbox.ticketing.queue.domain.QueueStatus;
import org.ticketbox.ticketing.queue.infrastructure.QueueAdmissionBus;
import org.ticketbox.ticketing.queue.infrastructure.RedisAdmissionControl;
import org.ticketbox.ticketing.queue.infrastructure.WaitingRoomService;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Testcontainers
class WaitingRoomServiceIntegrationTest {

    @Test
    void admissionHintPublishedOnOneNodeIsReceivedByBothNodesThroughRedis() {
        var local = mock(QueueRealtimeService.class);
        var remote = mock(QueueRealtimeService.class);
        var source = new QueueAdmissionBus(redisTemplate, local);
        var target = new QueueAdmissionBus(redisTemplate, remote);
        var listeners =
                new java.util.ArrayList<
                        org.springframework.data.redis.listener.RedisMessageListenerContainer>();
        try {
            for (var bus : java.util.List.of(source, target)) {
                var container =
                        new org.springframework.data.redis.listener.RedisMessageListenerContainer();
                container.setConnectionFactory(connectionFactory);
                container.addMessageListener(
                        bus,
                        new org.springframework.data.redis.listener.ChannelTopic(
                                QueueAdmissionBus.TOPIC));
                container.afterPropertiesSet();
                container.start();
                listeners.add(container);
            }
            UUID user = UUID.randomUUID();
            source.publish(new QueueAdmissionEvent(CONCERT_ID, user, null));
            org.mockito.Mockito.verify(local, org.mockito.Mockito.timeout(3000))
                    .onAdmissionHint(CONCERT_ID, user);
            org.mockito.Mockito.verify(remote, org.mockito.Mockito.timeout(3000))
                    .onAdmissionHint(CONCERT_ID, user);
        } finally {
            listeners.forEach(
                    org.springframework.data.redis.listener.RedisMessageListenerContainer::stop);
        }
    }

    @Test
    void staleFinishCannotEvictTheNextShoppingSession() {
        ReflectionTestUtils.setField(service, "sessionTtl", Duration.ofMinutes(10));
        UUID user = UUID.randomUUID();
        service.join(CONCERT_ID, user);
        service.promoteWaitingUsers(CONCERT_ID);
        String old = service.internalStatus(CONCERT_ID, user).queueAccessToken();
        service.leave(CONCERT_ID, user);
        service.join(CONCERT_ID, user);
        service.promoteWaitingUsers(CONCERT_ID);
        String current = service.internalStatus(CONCERT_ID, user).queueAccessToken();
        assertNotNull(current);
        service.finishShoppingSession(CONCERT_ID, user, old);
        assertEquals(current, service.internalStatus(CONCERT_ID, user).queueAccessToken());
        service.finishShoppingSession(CONCERT_ID, user, current);
        assertEquals(0L, redisTemplate.opsForZSet().zCard("queue:global-active"));
    }

    @Container
    private static final GenericContainer<?> redis =
            new GenericContainer<>("redis:7").withExposedPorts(6379);

    private static final UUID CONCERT_ID = UUID.randomUUID();

    private StringRedisTemplate redisTemplate;
    private LettuceConnectionFactory connectionFactory;
    private WaitingRoomService service;
    private ConcertOrderPort concertOrderPort;
    private QueueMetadataService metadata;
    private ApplicationEventPublisher publisher;
    private DispatchBacklog backlog;
    private RedisAdmissionControl admission;

    @BeforeEach
    void setUp() {
        connectionFactory =
                new LettuceConnectionFactory(redis.getHost(), redis.getFirstMappedPort());
        connectionFactory.afterPropertiesSet();
        redisTemplate = new StringRedisTemplate(connectionFactory);
        try (var connection = connectionFactory.getConnection()) {
            connection.serverCommands().flushDb();
        }

        concertOrderPort = mock(ConcertOrderPort.class);
        when(concertOrderPort.findConcertById(CONCERT_ID))
                .thenReturn(
                        Optional.of(
                                new ConcertView(
                                        CONCERT_ID,
                                        "Demo Concert",
                                        "ON_SALE",
                                        OffsetDateTime.now().plusDays(1),
                                        OffsetDateTime.now().minusDays(1),
                                        OffsetDateTime.now().plusDays(2))));

        publisher = mock(ApplicationEventPublisher.class);
        backlog = mock(DispatchBacklog.class);
        var mapper = new ObjectMapper().registerModule(new JavaTimeModule());
        var readCache = new RedisReadCache(new RedisConfig().redisTemplate(connectionFactory, mapper),
                mapper, new SimpleMeterRegistry());
        metadata = new QueueMetadataService(concertOrderPort, readCache);
        admission = newAdmissionControl();
        service = new WaitingRoomService(redisTemplate, metadata, new TokenBucketRateLimiter(redisTemplate),
                publisher, admission);
        ReflectionTestUtils.setField(service, "admissionCapacity", 1);
        ReflectionTestUtils.setField(service, "sessionTtl", Duration.ofMillis(450));
        ReflectionTestUtils.setField(service, "estimatedServiceSeconds", 30L);
        ReflectionTestUtils.setField(service, "admissionRate", 1000);
        ReflectionTestUtils.setField(service, "admissionBurst", 1000);
        ReflectionTestUtils.setField(service, "globalAdmissionRate", 1000);
        ReflectionTestUtils.setField(service, "globalAdmissionBurst", 1000);
    }

    private RedisAdmissionControl newAdmissionControl() {
        var limits = new RateLimitProperties(null, null,
                new RateLimitProperties.Policy(250, 250, Duration.ofSeconds(1)),
                new RateLimitProperties.Policy(170, 170, Duration.ofSeconds(1)), null);
        return new RedisAdmissionControl(redisTemplate, limits, List.of(backlog), true);
    }

    @AfterEach
    void tearDown() {
        try (var connection = connectionFactory.getConnection()) {
            connection.serverCommands().flushDb();
        } finally {
            connectionFactory.destroy();
        }
    }

    @Test
    void join_IsIdempotentForSameUserAndAdmitsFirstBuyer() {
        UUID userId = UUID.randomUUID();

        assertEquals(QueueStatus.WAITING, service.join(CONCERT_ID, userId).status());
        service.promoteWaitingUsers(CONCERT_ID);
        QueueStatusResponse first = service.status(CONCERT_ID, userId);
        QueueStatusResponse second = service.join(CONCERT_ID, userId);

        assertEquals(QueueStatus.ADMITTED, first.status());
        assertEquals(QueueStatus.ADMITTED, second.status());
        assertNotNull(first.queueAccessToken());
        assertEquals(first.queueAccessToken(), second.queueAccessToken());
        assertDoesNotThrow(
                () -> service.validateAccess(CONCERT_ID, userId, first.queueAccessToken()));
    }

    @Test
    void status_WaitsBehindActiveSessionThenAdmitsAfterExpiry() throws InterruptedException {
        UUID firstUser = UUID.randomUUID();
        UUID secondUser = UUID.randomUUID();

        service.join(CONCERT_ID, firstUser);
        service.promoteWaitingUsers(CONCERT_ID);
        QueueStatusResponse waiting = service.join(CONCERT_ID, secondUser);

        assertEquals(QueueStatus.WAITING, waiting.status());
        assertEquals(1, waiting.position());
        assertEquals(0, waiting.peopleAhead());
        assertEquals(1L, waiting.queueSize());
        assertEquals(1L, waiting.activeShoppers());

        Thread.sleep(520);

        assertEquals(QueueStatus.WAITING, service.status(CONCERT_ID, secondUser).status());
        service.promoteWaitingUsers(CONCERT_ID);
        QueueStatusResponse admitted = service.status(CONCERT_ID, secondUser);
        assertEquals(QueueStatus.ADMITTED, admitted.status());
        assertNotNull(admitted.queueAccessToken());
    }

    @Test
    void finishShoppingSession_ImmediatelyPromotesNextQueuedUser() {
        UUID firstUser = UUID.randomUUID();
        UUID secondUser = UUID.randomUUID();

        service.join(CONCERT_ID, firstUser);
        service.promoteWaitingUsers(CONCERT_ID);
        QueueStatusResponse waiting = service.join(CONCERT_ID, secondUser);
        assertEquals(QueueStatus.WAITING, waiting.status());

        service.finishShoppingSession(CONCERT_ID, firstUser);

        assertEquals(QueueStatus.WAITING, service.status(CONCERT_ID, secondUser).status());
        service.promoteWaitingUsers(CONCERT_ID);
        QueueStatusResponse admitted = service.status(CONCERT_ID, secondUser);
        assertEquals(QueueStatus.ADMITTED, admitted.status());
        assertNotNull(admitted.queueAccessToken());
    }

    @Test
    void validateAccess_RejectsMissingInvalidAndExpiredToken() throws InterruptedException {
        UUID userId = UUID.randomUUID();
        service.join(CONCERT_ID, userId);
        service.promoteWaitingUsers(CONCERT_ID);
        QueueStatusResponse admitted = service.status(CONCERT_ID, userId);

        assertThrows(
                org.ticketbox.ticketing.domain.DomainViolation.class,
                () -> service.validateAccess(CONCERT_ID, userId, null));
        assertThrows(
                org.ticketbox.ticketing.domain.DomainViolation.class,
                () -> service.validateAccess(CONCERT_ID, userId, "bad-token"));

        Thread.sleep(520);

        assertThrows(
                org.ticketbox.ticketing.domain.DomainViolation.class,
                () -> service.validateAccess(CONCERT_ID, userId, admitted.queueAccessToken()));
    }

    @Test
    void join_BeforeSaleStart_PlacesUserInWaitingRoomWithoutAdmission() {
        when(concertOrderPort.findConcertById(CONCERT_ID))
                .thenReturn(
                        Optional.of(
                                new ConcertView(
                                        CONCERT_ID,
                                        "Demo Concert",
                                        "ON_SALE",
                                        OffsetDateTime.now().plusDays(1),
                                        OffsetDateTime.now().plusMinutes(30),
                                        OffsetDateTime.now().plusDays(2))));

        QueueStatusResponse waitingRoom = service.join(CONCERT_ID, UUID.randomUUID());

        assertEquals(QueueStatus.WAITING_ROOM, waitingRoom.status());
        assertNull(waitingRoom.position());
        assertNull(waitingRoom.queueAccessToken());
        assertEquals(1L, waitingRoom.waitingRoomCount());
        assertEquals(0L, waitingRoom.queueSize());
    }

    @Test
    void saleStart_SnapshotsWaitingRoomThenKeepsNextFanAtTheFrontOfQueue() {
        ReflectionTestUtils.setField(service, "sessionTtl", Duration.ofMinutes(10));
        UUID firstUser = UUID.randomUUID();
        UUID secondUser = UUID.randomUUID();
        ConcertView beforeSale =
                new ConcertView(
                        CONCERT_ID,
                        "Demo Concert",
                        "ON_SALE",
                        OffsetDateTime.now().plusDays(1),
                        OffsetDateTime.now().plusMinutes(30),
                        OffsetDateTime.now().plusDays(2));
        when(concertOrderPort.findConcertById(CONCERT_ID)).thenReturn(Optional.of(beforeSale));

        service.join(CONCERT_ID, firstUser);
        service.join(CONCERT_ID, secondUser);

        ConcertView afterSale =
                new ConcertView(
                        CONCERT_ID,
                        "Demo Concert",
                        "ON_SALE",
                        OffsetDateTime.now().plusDays(1),
                        OffsetDateTime.now().minusSeconds(1),
                        OffsetDateTime.now().plusDays(2));
        when(concertOrderPort.findConcertById(CONCERT_ID)).thenReturn(Optional.of(afterSale));

        redisTemplate.delete("cache:queue:metadata:" + CONCERT_ID);
        service.createDueQueueSnapshots();
        QueueStatusResponse firstStatus = service.status(CONCERT_ID, firstUser);
        QueueStatusResponse secondStatus = service.status(CONCERT_ID, secondUser);
        UUID queuedUser = firstStatus.status() == QueueStatus.WAITING ? firstUser : secondUser;
        QueueStatusResponse queued = service.status(CONCERT_ID, queuedUser);

        assertEquals(QueueStatus.WAITING, queued.status());
        assertEquals(1, queued.position());
        assertEquals(0, queued.peopleAhead());
        assertEquals(0L, queued.waitingRoomCount());
        assertEquals(1L, queued.queueSize());
        assertEquals(1L, queued.activeShoppers());
    }

    @Test
    void adaptiveOpeningPublishesExistingPrioritiesAndPutsLateArrivalsLast() {
        ReflectionTestUtils.setField(service, "adaptiveEnabled", true);
        String room = "waiting-room:concert:" + CONCERT_ID;
        String queue = "queue:concert:" + CONCERT_ID;
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        UUID departed = UUID.randomUUID();
        UUID late = UUID.randomUUID();
        saleStartsAt(OffsetDateTime.now().plusMinutes(5));
        service.join(CONCERT_ID, first);
        Double original = redisTemplate.opsForZSet().score(room, first.toString());
        service.join(CONCERT_ID, first);
        assertEquals(original, redisTemplate.opsForZSet().score(room, first.toString()));
        service.join(CONCERT_ID, second);
        service.join(CONCERT_ID, departed);
        var openingOrder = redisTemplate.opsForZSet().range(room, 0, -1);
        saleStartsAt(OffsetDateTime.now().minusSeconds(1));
        service.leave(CONCERT_ID, departed);
        assertEquals(3, service.join(CONCERT_ID, late).position());
        service.join(CONCERT_ID, late);
        assertEquals(openingOrder.stream().filter(id -> !id.equals(departed.toString())).toList(),
                redisTemplate.opsForZSet().range(queue, 0, 1).stream().toList());
        assertEquals(original, redisTemplate.opsForZSet().score(queue, first.toString()));
        assertEquals(3L, redisTemplate.opsForZSet().zCard(queue));
    }

    @Test
    void adaptiveOpeningKeepsCustomersAlreadyInALegacyRoom() {
        saleStartsAt(OffsetDateTime.now().plusMinutes(5));
        UUID legacy = UUID.randomUUID();
        UUID next = UUID.randomUUID();
        service.join(CONCERT_ID, legacy);
        ReflectionTestUtils.setField(service, "adaptiveEnabled", true);
        service.join(CONCERT_ID, next);
        saleStartsAt(OffsetDateTime.now().minusSeconds(1));
        assertEquals(3, service.join(CONCERT_ID, UUID.randomUUID()).position());
        assertEquals(QueueStatus.WAITING, service.status(CONCERT_ID, legacy).status());
        assertEquals(QueueStatus.WAITING, service.status(CONCERT_ID, next).status());
    }

    private void saleStartsAt(OffsetDateTime start) {
        when(concertOrderPort.findConcertById(CONCERT_ID)).thenReturn(Optional.of(new ConcertView(
                CONCERT_ID, "Demo Concert", "ON_SALE", start.plusDays(1), start, start.plusDays(2))));
        redisTemplate.delete("cache:queue:metadata:" + CONCERT_ID);
    }

    @Test
    void adaptivePresenceDistinguishesRenewalExplicitLeaveAndExpiredRejoin() {
        ReflectionTestUtils.setField(service, "adaptiveEnabled", true);
        String queue = "queue:concert:" + CONCERT_ID;
        String presence = "queue:presence:" + CONCERT_ID;
        UUID first = UUID.randomUUID();
        UUID mid = UUID.randomUUID();
        UUID last = UUID.randomUUID();
        service.join(CONCERT_ID, first);
        service.join(CONCERT_ID, mid);
        service.join(CONCERT_ID, last);
        Double oldScore = redisTemplate.opsForZSet().score(queue, last.toString());
        service.leave(CONCERT_ID, mid);
        assertEquals(2, service.status(CONCERT_ID, last).position());
        assertEquals(oldScore, redisTemplate.opsForZSet().score(queue, last.toString()));
        double deadline = redisTemplate.opsForZSet().score(presence, last.toString());
        assertTrue(deadline - System.currentTimeMillis() > 170_000);
        assertEquals(3, service.join(CONCERT_ID, mid).position());
        redisTemplate.opsForZSet().add(presence, last.toString(), 0);
        assertEquals(QueueStatus.EXPIRED, service.status(CONCERT_ID, last).status());
        assertEquals(3, service.join(CONCERT_ID, last).position());
        assertTrue(redisTemplate.opsForZSet().score(queue, last.toString()) > oldScore);
    }

    @Test
    void adaptivePromotionSkipsExpiredHeadAndReconnectRecoversTheGrant() {
        ReflectionTestUtils.setField(service, "adaptiveEnabled", true);
        ReflectionTestUtils.setField(service, "sessionTtl", Duration.ofMinutes(10));
        UUID expired = UUID.randomUUID();
        UUID next = UUID.randomUUID();
        service.join(CONCERT_ID, expired);
        service.join(CONCERT_ID, next);
        redisTemplate.opsForZSet().add("queue:presence:" + CONCERT_ID, expired.toString(), 0);
        var grants = service.promoteWaitingUsers(CONCERT_ID);
        var restored = service.join(CONCERT_ID, next);
        assertEquals(QueueStatus.ADMITTED, restored.status());
        assertEquals(grants.get(next).queueAccessToken(), restored.queueAccessToken());
        assertEquals(QueueStatus.LEFT, service.status(CONCERT_ID, expired).status());
        assertEquals(1L, service.snapshot(CONCERT_ID).activeShoppers());
    }

    @Test
    void anOldCleanupCandidateCannotRemoveARejoinedPlaceOrItsNewSession() {
        ReflectionTestUtils.setField(service, "adaptiveEnabled", true);
        ReflectionTestUtils.setField(service, "sessionTtl", Duration.ofMinutes(10));
        UUID buyer = UUID.randomUUID();
        service.join(CONCERT_ID, buyer);
        redisTemplate.opsForZSet().add("queue:presence:" + CONCERT_ID, buyer.toString(), 0);
        service.join(CONCERT_ID, buyer);
        assertFalse(ReflectionTestUtils.<Boolean>invokeMethod(service, "removeExpiredUser", CONCERT_ID, buyer));
        assertEquals(1, service.status(CONCERT_ID, buyer).position());
        var grant = service.promoteWaitingUsers(CONCERT_ID).get(buyer);
        assertFalse(ReflectionTestUtils.<Boolean>invokeMethod(service, "removeExpiredUser", CONCERT_ID, buyer));
        assertEquals(grant.queueAccessToken(), service.status(CONCERT_ID, buyer).queueAccessToken());
    }

    @Test
    void leavingDuringALegacyDrawRemovesTheAlreadyCopiedEntry() {
        UUID buyer = UUID.randomUUID();
        String lock = "fixture-lock";
        String staging = "queue:draw-staging:" + CONCERT_ID + ":" + lock;
        redisTemplate.opsForValue().set("queue:draw-lock:" + CONCERT_ID, lock);
        redisTemplate.opsForValue().set("queue:draw-state:" + CONCERT_ID, "DRAWING");
        redisTemplate.opsForZSet().add("queue:draw-source:" + CONCERT_ID, buyer.toString(), 1);
        redisTemplate.opsForZSet().add(staging, buyer.toString(), 1);
        service.leave(CONCERT_ID, buyer);
        assertNull(redisTemplate.opsForZSet().score(staging, buyer.toString()));
        assertNull(redisTemplate.opsForZSet().score("queue:draw-source:" + CONCERT_ID, buyer.toString()));
    }

    @Test
    void adaptiveSchedulerSharesRateBetweenConcertsWithoutLegacyActiveCap() {
        ReflectionTestUtils.setField(service, "adaptiveEnabled", true);
        ReflectionTestUtils.setField(service, "globalAdmissionCapacity", 1);
        ReflectionTestUtils.setField(service, "sessionTtl", Duration.ofMinutes(10));
        UUID small = UUID.randomUUID();
        when(concertOrderPort.findConcertById(small)).thenReturn(Optional.of(new ConcertView(
                small, "Small Concert", "ON_SALE", OffsetDateTime.now().plusDays(1),
                OffsetDateTime.now().minusDays(1), OffsetDateTime.now().plusDays(2))));
        for (int i = 0; i < 30; i++) service.join(CONCERT_ID, UUID.randomUUID());
        UUID smallBuyer = UUID.randomUUID();
        service.join(small, smallBuyer);
        service.createDueQueueSnapshots();
        assertEquals(QueueStatus.ADMITTED, service.status(small, smallBuyer).status());
        assertEquals(5, service.snapshot(CONCERT_ID).activeShoppers());
        assertEquals(25, service.snapshot(CONCERT_ID).queueSize());
        assertEquals(1, service.snapshot(small).activeShoppers());
        String token = service.status(small, smallBuyer).queueAccessToken();
        ReflectionTestUtils.setField(service, "adaptiveEnabled", false);
        assertEquals(token, service.join(small, smallBuyer).queueAccessToken());
    }

    @Test
    void adaptivePollingHintsFollowRedisRankAndAreOptionalForLegacyResponses() throws Exception {
        UUID user = UUID.randomUUID();
        var mapper = new ObjectMapper().registerModule(new JavaTimeModule());
        var legacy = service.join(CONCERT_ID, user);
        assertFalse(mapper.valueToTree(legacy).has("pollAfterMs"));
        ReflectionTestUtils.setField(service, "adaptiveEnabled", true);
        assertEquals(5_000L, service.status(CONCERT_ID, user).pollAfterMs());
        var waiting = redisTemplate.opsForZSet();
        String key = "queue:concert:" + CONCERT_ID;
        int ahead = 0;
        for (int count : new int[]{999, 1_000, 9_999, 10_000}) {
            var members = new HashSet<TypedTuple<String>>();
            for (int rank = ahead + 1; rank <= count; rank++) {
                members.add(TypedTuple.of("ahead-" + rank, -(double) rank));
            }
            waiting.add(key, members);
            ahead = count;
            long expected = count < 1000 ? 5_000 : count < 10_000 ? 20_000 : 60_000;
            assertEquals(expected, service.status(CONCERT_ID, user).pollAfterMs());
        }
        redisTemplate.delete("queue:draw-state:" + CONCERT_ID);
        saleStartsAt(OffsetDateTime.now().plusMinutes(1));
        assertEquals(60_000L, service.join(CONCERT_ID, UUID.randomUUID()).pollAfterMs());
    }

    @Test
    void separateWorkersConsumeTheSameSharedCreditsAcrossTwoBacklogs() throws Exception {
        ReflectionTestUtils.setField(service, "adaptiveEnabled", true);
        ReflectionTestUtils.setField(service, "sessionTtl", Duration.ofMinutes(10));
        var replica = new WaitingRoomService(redisTemplate, metadata, new TokenBucketRateLimiter(redisTemplate),
                publisher, newAdmissionControl());
        ReflectionTestUtils.setField(replica, "adaptiveEnabled", true);
        UUID other = UUID.randomUUID();
        when(concertOrderPort.findConcertById(other)).thenReturn(Optional.of(new ConcertView(
                other, "Other Concert", "ON_SALE", OffsetDateTime.now().plusDays(1),
                OffsetDateTime.now().minusDays(1), OffsetDateTime.now().plusDays(2))));
        for (int index = 0; index < 20; index++) {
            service.join(CONCERT_ID, UUID.randomUUID());
            service.join(other, UUID.randomUUID());
        }
        redisTemplate.opsForHash().putAll("queue:adaptive:policy:shared",
                Map.of("window", "999999999", "rate", "2"));
        redisTemplate.opsForHash().putAll("queue:global-admission-budget",
                Map.of("at", Long.toString(System.currentTimeMillis() + 60_000), "tokens", "2"));
        try (var workers = java.util.concurrent.Executors.newFixedThreadPool(6)) {
            var started = new java.util.concurrent.CountDownLatch(1);
            var futures = new java.util.ArrayList<java.util.concurrent.Future<Integer>>();
            for (int index = 0; index < 8; index++) {
                var worker = index % 2 == 0 ? service : replica;
                var concert = index % 4 < 2 ? CONCERT_ID : other;
                futures.add(workers.submit(() -> {
                    started.await();
                    return worker.promoteWaitingUsers(concert).size();
                }));
            }
            started.countDown();
            int grants = 0;
            for (var future : futures) grants += future.get(8, java.util.concurrent.TimeUnit.SECONDS);
            assertEquals(2, grants);
        }
        assertEquals(2L, redisTemplate.opsForZSet().zCard("queue:global-active"));
        assertEquals(38L, service.snapshot(CONCERT_ID).queueSize() + service.snapshot(other).queueSize());
    }

    @Test
    void sharedHealthUsesOneCompletedWindowPerWorkerAndIgnoresStaleHealthySamples() {
        String shared = "queue:adaptive:policy:shared";
        String counters = "queue:adaptive:health:shared:";
        long window = ReflectionTestUtils.invokeMethod(admission, "completedWindow");
        when(backlog.overdue()).thenReturn(true, false, false, false, false);
        ReflectionTestUtils.invokeMethod(admission, "refreshShared", window);
        ReflectionTestUtils.invokeMethod(newAdmissionControl(), "refreshShared", window);
        verify(backlog, times(1)).overdue();
        assertEquals("33", redisTemplate.opsForHash().get(shared, "rate"));
        redisTemplate.opsForHash().put(counters + (window + 1), "RESERVE:total", "20");
        ReflectionTestUtils.invokeMethod(admission, "refreshShared", window + 1);
        assertEquals("1", redisTemplate.opsForHash().get(shared, "healthy"));
        redisTemplate.opsForHash().put(counters + (window + 3), "RESERVE:total", "20");
        ReflectionTestUtils.invokeMethod(admission, "refreshShared", window + 3);
        assertEquals("33", redisTemplate.opsForHash().get(shared, "rate"));
        redisTemplate.opsForHash().put(counters + (window + 4), "RESERVE:total", "20");
        ReflectionTestUtils.invokeMethod(admission, "refreshShared", window + 4);
        assertEquals("38", redisTemplate.opsForHash().get(shared, "rate"));
        admission.record(null, Path.PAYMENT, false, true, true);
    }

    @Test
    void loweredAdaptiveCapDrainsExistingLeasesWithoutRevocation() {
        ReflectionTestUtils.setField(service, "adaptiveEnabled", true);
        ReflectionTestUtils.setField(service, "sessionTtl", Duration.ofMinutes(10));
        UUID current = UUID.randomUUID();
        UUID waiting = UUID.randomUUID();
        service.join(CONCERT_ID, current);
        String token = service.promoteWaitingUsers(CONCERT_ID).get(current).queueAccessToken();
        service.join(CONCERT_ID, waiting);
        String policy = "queue:adaptive:policy:" + CONCERT_ID;
        redisTemplate.opsForHash().putAll(policy,
                Map.of("window", "999999999", "peak", "10", "rate", "1", "capacity", "144"));
        String active = "queue:active:" + CONCERT_ID;
        var leases = new HashSet<TypedTuple<String>>();
        double future = System.currentTimeMillis() + 30_000;
        for (int index = 0; index < 143; index++) {
            leases.add(TypedTuple.of("fixture-" + index, future));
        }
        redisTemplate.opsForZSet().add(active, leases);
        assertTrue(service.promoteWaitingUsers(CONCERT_ID).isEmpty());
        assertEquals(token, service.status(CONCERT_ID, current).queueAccessToken());
        redisTemplate.opsForZSet().add(active, "fixture-0", 0);
        assertEquals(QueueStatus.ADMITTED, service.promoteWaitingUsers(CONCERT_ID).get(waiting).status());
        assertEquals(token, service.status(CONCERT_ID, current).queueAccessToken());
    }

    @Test
    void repeatedUpdatesReadConcertMetadataOnceAcrossUsers() {
        ReflectionTestUtils.setField(service, "sessionTtl", Duration.ofMinutes(10));
        for (int index = 0; index < 50; index++) {
            UUID user = UUID.randomUUID();
            service.join(CONCERT_ID, user);
            service.internalStatus(CONCERT_ID, user);
        }
        verify(concertOrderPort, times(1)).findConcertById(CONCERT_ID);
    }

    @Test
    void snapshotContainsOnlySharedCountersAndPromotionDoesNotNeedClientPolling() {
        ReflectionTestUtils.setField(service, "sessionTtl", Duration.ofMinutes(10));
        UUID first = UUID.randomUUID();
        UUID next = UUID.randomUUID();
        service.join(CONCERT_ID, first);
        service.promoteWaitingUsers(CONCERT_ID);
        service.join(CONCERT_ID, next);
        service.finishShoppingSession(CONCERT_ID, first);
        var promoted = service.promoteWaitingUsers(CONCERT_ID);
        assertEquals(QueueStatus.ADMITTED, promoted.get(next).status());
        assertEquals(0, service.snapshot(CONCERT_ID).queueSize());
        assertEquals(1, service.snapshot(CONCERT_ID).activeShoppers());
    }

    @Test
    void reconnectRetainsMembershipAndExpiredPresenceIsRemoved() {
        ReflectionTestUtils.setField(service, "sessionTtl", Duration.ofMinutes(10));
        UUID first = UUID.randomUUID();
        UUID next = UUID.randomUUID();
        service.join(CONCERT_ID, first);
        service.promoteWaitingUsers(CONCERT_ID);
        service.join(CONCERT_ID, next);
        assertEquals(QueueStatus.WAITING, service.join(CONCERT_ID, next).status());
        redisTemplate.opsForZSet().add("queue:presence:" + CONCERT_ID, next.toString(), 0);
        service.createDueQueueSnapshots();
        assertEquals(0, service.snapshot(CONCERT_ID).queueSize());
        assertEquals(QueueStatus.LEFT, service.status(CONCERT_ID, next).status());
    }

    @Test
    void statusCannotAdmitAndManyWorkersShareOneRateBudget() throws Exception {
        ReflectionTestUtils.setField(service, "sessionTtl", Duration.ofMinutes(10));
        ReflectionTestUtils.setField(service, "admissionCapacity", 20);
        ReflectionTestUtils.setField(service, "admissionRate", 1);
        ReflectionTestUtils.setField(service, "admissionBurst", 2);
        for (int i = 0; i < 30; i++) {
            UUID user = UUID.randomUUID();
            service.join(CONCERT_ID, user);
            assertEquals(QueueStatus.WAITING, service.status(CONCERT_ID, user).status());
        }
        assertEquals(0, service.snapshot(CONCERT_ID).activeShoppers());
        try (var workers = java.util.concurrent.Executors.newFixedThreadPool(8)) {
            var tasks = new java.util.ArrayList<java.util.concurrent.Callable<Object>>();
            for (int i = 0; i < 8; i++) tasks.add(() -> service.promoteWaitingUsers(CONCERT_ID));
            for (var result : workers.invokeAll(tasks)) result.get();
        }
        assertEquals(2, service.snapshot(CONCERT_ID).activeShoppers());
        assertEquals(28, service.snapshot(CONCERT_ID).queueSize());
    }

    @Test
    void concertsShareGlobalSessionLimitAndReleaseCapacityAtomically() {
        ReflectionTestUtils.setField(service, "sessionTtl", Duration.ofMinutes(10));
        ReflectionTestUtils.setField(service, "admissionCapacity", 10);
        ReflectionTestUtils.setField(service, "globalAdmissionCapacity", 1);
        UUID otherConcert = UUID.randomUUID();
        when(concertOrderPort.findConcertById(otherConcert))
                .thenReturn(
                        Optional.of(
                                new ConcertView(
                                        otherConcert,
                                        "Other",
                                        "ON_SALE",
                                        OffsetDateTime.now().plusDays(1),
                                        OffsetDateTime.now().minusMinutes(1),
                                        OffsetDateTime.now().plusDays(2))));
        UUID first = UUID.randomUUID(), next = UUID.randomUUID();
        service.join(CONCERT_ID, first);
        service.join(otherConcert, next);
        service.promoteWaitingUsers(CONCERT_ID);
        service.promoteWaitingUsers(otherConcert);
        assertEquals(QueueStatus.WAITING, service.status(otherConcert, next).status());
        service.finishShoppingSession(CONCERT_ID, first);
        service.promoteWaitingUsers(otherConcert);
        assertEquals(QueueStatus.ADMITTED, service.status(otherConcert, next).status());
        assertEquals(1L, redisTemplate.opsForZSet().zCard("queue:global-active"));
    }
}
