package com.ticketbox.module.queue.application;

import com.ticketbox.infrastructure.redis.TokenBucketRateLimiter;
import com.ticketbox.infrastructure.redis.RedisReadCache;
import com.ticketbox.infrastructure.redis.RedisConfig;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;
import com.ticketbox.module.concert.ConcertOrderPort;
import com.ticketbox.module.concert.ConcertView;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.module.queue.web.dto.QueueStatusResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@Testcontainers
class WaitingRoomServiceIntegrationTest {

    @Test
    void admissionHintPublishedOnOneNodeIsReceivedByBothNodesThroughRedis() {
        var local=mock(QueueRealtimeService.class); var remote=mock(QueueRealtimeService.class);
        var source=new QueueAdmissionBus(redisTemplate,local); var target=new QueueAdmissionBus(redisTemplate,remote);
        var listeners=new java.util.ArrayList<org.springframework.data.redis.listener.RedisMessageListenerContainer>();
        try {
            for (var bus : java.util.List.of(source,target)) {
                var container=new org.springframework.data.redis.listener.RedisMessageListenerContainer();
                container.setConnectionFactory(connectionFactory);
                container.addMessageListener(bus,new org.springframework.data.redis.listener.ChannelTopic(QueueAdmissionBus.TOPIC));
                container.afterPropertiesSet(); container.start(); listeners.add(container);
            }
            UUID user=UUID.randomUUID();
            source.publish(new QueueAdmissionEvent(CONCERT_ID,user,null));
            org.mockito.Mockito.verify(local,org.mockito.Mockito.timeout(3000)).onAdmissionHint(CONCERT_ID,user);
            org.mockito.Mockito.verify(remote,org.mockito.Mockito.timeout(3000)).onAdmissionHint(CONCERT_ID,user);
        } finally { listeners.forEach(org.springframework.data.redis.listener.RedisMessageListenerContainer::stop); }
    }

    @Test
    void staleFinishCannotEvictTheNextShoppingSession() {
        ReflectionTestUtils.setField(service, "sessionTtl", Duration.ofMinutes(10));
        UUID user=UUID.randomUUID();
        service.join(CONCERT_ID,user); service.promoteWaitingUsers(CONCERT_ID);
        String old=service.internalStatus(CONCERT_ID,user).queueAccessToken();
        service.leave(CONCERT_ID,user);
        service.join(CONCERT_ID,user); service.promoteWaitingUsers(CONCERT_ID);
        String current=service.internalStatus(CONCERT_ID,user).queueAccessToken();
        assertNotNull(current);
        service.finishShoppingSession(CONCERT_ID,user,old);
        assertEquals(current,service.internalStatus(CONCERT_ID,user).queueAccessToken());
        service.finishShoppingSession(CONCERT_ID,user,current);
        assertEquals(0L,redisTemplate.opsForZSet().zCard("queue:global-active"));
    }

    @Container
    private static final GenericContainer<?> redis = new GenericContainer<>("redis:7")
            .withExposedPorts(6379);

    private static final UUID CONCERT_ID = UUID.randomUUID();

    private StringRedisTemplate redisTemplate;
    private LettuceConnectionFactory connectionFactory;
    private WaitingRoomService service;
    private ConcertOrderPort concertOrderPort;

    @BeforeEach
    void setUp() {
        connectionFactory = new LettuceConnectionFactory(redis.getHost(), redis.getFirstMappedPort());
        connectionFactory.afterPropertiesSet();
        redisTemplate = new StringRedisTemplate(connectionFactory);
        try (var connection = connectionFactory.getConnection()) { connection.serverCommands().flushDb(); }

        concertOrderPort = mock(ConcertOrderPort.class);
        when(concertOrderPort.findConcertById(CONCERT_ID))
                .thenReturn(Optional.of(new ConcertView(CONCERT_ID, "Demo Concert", "ON_SALE", OffsetDateTime.now().plusDays(1), OffsetDateTime.now().minusDays(1), OffsetDateTime.now().plusDays(2))));

        org.springframework.context.ApplicationEventPublisher eventPublisher = mock(org.springframework.context.ApplicationEventPublisher.class);
        var mapper = new ObjectMapper().registerModule(new JavaTimeModule());
        var readCache = new RedisReadCache(new RedisConfig().redisTemplate(connectionFactory, mapper), mapper, new SimpleMeterRegistry());
        service = new WaitingRoomService(redisTemplate, new QueueMetadataService(concertOrderPort, readCache), new TokenBucketRateLimiter(redisTemplate), eventPublisher);
        ReflectionTestUtils.setField(service, "admissionCapacity", 1);
        ReflectionTestUtils.setField(service, "sessionTtl", Duration.ofMillis(450));
        ReflectionTestUtils.setField(service, "estimatedServiceSeconds", 30L);
        ReflectionTestUtils.setField(service, "admissionRate", 1000);
        ReflectionTestUtils.setField(service, "admissionBurst", 1000);
        ReflectionTestUtils.setField(service, "globalAdmissionRate", 1000);
        ReflectionTestUtils.setField(service, "globalAdmissionBurst", 1000);
    }

    @AfterEach
    void tearDown() {
        try (var connection = connectionFactory.getConnection()) { connection.serverCommands().flushDb(); }
        finally { connectionFactory.destroy(); }
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
        assertDoesNotThrow(() -> service.validateAccess(CONCERT_ID, userId, first.queueAccessToken()));
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

        assertThrows(AppException.class, () -> service.validateAccess(CONCERT_ID, userId, null));
        assertThrows(AppException.class, () -> service.validateAccess(CONCERT_ID, userId, "bad-token"));

        Thread.sleep(520);

        assertThrows(AppException.class, () -> service.validateAccess(CONCERT_ID, userId, admitted.queueAccessToken()));
    }

    @Test
    void join_BeforeSaleStart_PlacesUserInWaitingRoomWithoutAdmission() {
        when(concertOrderPort.findConcertById(CONCERT_ID))
                .thenReturn(Optional.of(new ConcertView(
                        CONCERT_ID,
                        "Demo Concert",
                        "ON_SALE",
                        OffsetDateTime.now().plusDays(1),
                        OffsetDateTime.now().plusMinutes(30),
                        OffsetDateTime.now().plusDays(2)
                )));

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
        ConcertView beforeSale = new ConcertView(
                CONCERT_ID, "Demo Concert", "ON_SALE", OffsetDateTime.now().plusDays(1),
                OffsetDateTime.now().plusMinutes(30), OffsetDateTime.now().plusDays(2));
        when(concertOrderPort.findConcertById(CONCERT_ID)).thenReturn(Optional.of(beforeSale));

        service.join(CONCERT_ID, firstUser);
        service.join(CONCERT_ID, secondUser);

        ConcertView afterSale = new ConcertView(
                CONCERT_ID, "Demo Concert", "ON_SALE", OffsetDateTime.now().plusDays(1),
                OffsetDateTime.now().minusSeconds(1), OffsetDateTime.now().plusDays(2));
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
            UUID user = UUID.randomUUID(); service.join(CONCERT_ID, user);
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
        when(concertOrderPort.findConcertById(otherConcert)).thenReturn(Optional.of(new ConcertView(
                otherConcert, "Other", "ON_SALE", OffsetDateTime.now().plusDays(1),
                OffsetDateTime.now().minusMinutes(1), OffsetDateTime.now().plusDays(2))));
        UUID first = UUID.randomUUID(), next = UUID.randomUUID();
        service.join(CONCERT_ID, first); service.join(otherConcert, next);
        service.promoteWaitingUsers(CONCERT_ID); service.promoteWaitingUsers(otherConcert);
        assertEquals(QueueStatus.WAITING, service.status(otherConcert, next).status());
        service.finishShoppingSession(CONCERT_ID, first); service.promoteWaitingUsers(otherConcert);
        assertEquals(QueueStatus.ADMITTED, service.status(otherConcert, next).status());
        assertEquals(1L, redisTemplate.opsForZSet().zCard("queue:global-active"));
    }

}
