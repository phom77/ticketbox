package org.ticketbox.ticketing.order.application;

import org.ticketbox.ticketing.redis.IdempotencyService;
import org.ticketbox.ticketing.integration.catalog.ConcertOrderPort;
import org.ticketbox.ticketing.integration.catalog.ConcertView;
import org.ticketbox.ticketing.integration.catalog.TicketTypeView;
import org.ticketbox.ticketing.order.application.mapper.OrderMapper;
import org.ticketbox.ticketing.order.domain.Order;
import org.ticketbox.ticketing.order.domain.OrderItem;
import org.ticketbox.ticketing.order.domain.OrderItemRepository;
import org.ticketbox.ticketing.order.domain.OrderRepository;
import org.ticketbox.ticketing.order.web.dto.CreateOrderRequest;
import org.ticketbox.ticketing.order.web.dto.OrderItemRequest;
import org.ticketbox.ticketing.queue.QueueAccessPort;
import org.ticketbox.ticketing.web.AppException;
import org.ticketbox.ticketing.web.ErrorCode;
import org.ticketbox.ticketing.inventory.hold.domain.TicketHoldRepository;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
public class OrderConcurrencyTest {

    @Mock
    private ConcertOrderPort concertOrderPort;

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private OrderItemRepository orderItemRepository;

    @Mock
    private OrderMapper orderMapper;

    @Mock
    private StringRedisTemplate redisTemplate;

    @Mock
    private IdempotencyService idempotencyService;

    @Mock
    private QueueAccessPort queueAccessPort;

    @Mock
    private TicketHoldRepository ticketHoldRepository;

    @Mock
    private org.ticketbox.ticketing.inventory.hold.application.PurchaseGuard purchaseGuard;

    @Mock private org.ticketbox.ticketing.inventory.InventoryPort inventory;

    @Mock
    private org.ticketbox.ticketing.order.infrastructure.OrderEventStore orderEvents;

    @InjectMocks
    private OrderService orderService;

    private UUID concertId;
    private UUID ticketTypeId;
    private ConcertView concertView;
    private TicketTypeView ticketTypeView;

    @BeforeEach
    void setUp() {
        concertId = UUID.randomUUID();
        ticketTypeId = UUID.randomUUID();

        concertView = new ConcertView(
                concertId,
                "Concert Title",
                "ON_SALE",
                OffsetDateTime.now().plusDays(1),
                OffsetDateTime.now().minusDays(1),
                OffsetDateTime.now().plusDays(2)
        );

        ticketTypeView = new TicketTypeView(
                ticketTypeId,
                concertId,
                "Regular Zone",
                BigDecimal.valueOf(100),
                100,
                100,
                2, // maxPerAccount
                true
        );
    }

    @Test
    void testOversellingProtectionConcurrently() throws InterruptedException {
        int threadCount = 10;
        int maxTickets = 5;

        // Mock basic concert and ticket type lookups
        when(concertOrderPort.findConcertById(concertId)).thenReturn(Optional.of(concertView));
        when(concertOrderPort.findTicketTypesByIds(anyList())).thenReturn(List.of(ticketTypeView));
        when(ticketHoldRepository.findByUserIdAndConcertId(any(), any())).thenReturn(Collections.emptyList());

        // Mock idempotency claiming to return valid dummy claims
        when(idempotencyService.claimOrder(any(), anyString())).thenAnswer(invocation -> {
            String key = invocation.getArgument(1);
            return new IdempotencyService.IdempotencyClaim("dummyRedisKey", "dummyToken", key);
        });

        // Mock user locks to always succeed (different users, so they don't lock each other)
        ValueOperations<String, String> valOps = mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valOps);
        when(valOps.setIfAbsent(anyString(), anyString(), any(Duration.class))).thenReturn(true);

        // Thread-safe inventory reservation simulation
        AtomicInteger remainingInventory = new AtomicInteger(maxTickets);
        when(inventory.reserve(eq(ticketTypeId), anyInt())).thenAnswer(invocation -> {
            int quantityRequested = invocation.getArgument(1);
            while (true) {
                int current = remainingInventory.get();
                if (current < quantityRequested) {
                    return false;
                }
                if (remainingInventory.compareAndSet(current, current - quantityRequested)) {
                    return true;
                }
            }
        });

        // Mock order savings
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));

        // Run concurrent threads calling createOrder
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(threadCount);

        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger failureCount = new AtomicInteger(0);

        for (int i = 0; i < threadCount; i++) {
            executor.submit(() -> {
                TransactionSynchronizationManager.initSynchronization();
                try {
                    startLatch.await();
                    CreateOrderRequest request = new CreateOrderRequest(
                            concertId,
                            List.of(new OrderItemRequest(ticketTypeId, 1))
                    );
                    orderService.createOrder(request, UUID.randomUUID(), UUID.randomUUID().toString(), "queue-token");
                    successCount.incrementAndGet();
                } catch (AppException e) {
                    if (e.getErrorCode() == ErrorCode.TICKET_SOLD_OUT) {
                        failureCount.incrementAndGet();
                    } else {
                        System.out.println("Unexpected App Error: " + e.getErrorCode());
                    }
                } catch (Exception e) {
                    System.out.println("Unexpected System Error: " + e.getMessage());
                } finally {
                    TransactionSynchronizationManager.clear();
                    doneLatch.countDown();
                }
            });
        }

        startLatch.countDown(); // trigger threads simultaneously
        doneLatch.await();
        executor.shutdown();

        // Exactly 5 purchases must succeed, and exactly 5 must fail with SOLD_OUT exception
        assertEquals(maxTickets, successCount.get());
        assertEquals(threadCount - maxTickets, failureCount.get());
        assertEquals(0, remainingInventory.get());
    }

    @Test
    void testMaxPerAccountLimitConcurrently() throws InterruptedException {
        int threadCount = 5;
        UUID singleUserId = UUID.randomUUID();

        when(concertOrderPort.findConcertById(concertId)).thenReturn(Optional.of(concertView));
        when(concertOrderPort.findTicketTypesByIds(anyList())).thenReturn(List.of(ticketTypeView));
        when(ticketHoldRepository.findByUserIdAndConcertId(any(), any())).thenReturn(Collections.emptyList());
        when(inventory.reserve(eq(ticketTypeId), anyInt())).thenReturn(true);
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));

        when(idempotencyService.claimOrder(any(), anyString())).thenAnswer(invocation -> {
            String key = invocation.getArgument(1);
            return new IdempotencyService.IdempotencyClaim("dummyRedisKey", "dummyToken", key);
        });

        // Mock the User lock: Only the first thread will successfully acquire the lock,
        // because we are using the SAME singleUserId. Subsequent concurrent threads get setIfAbsent = false.
        ValueOperations<String, String> valOps = mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valOps);

        AtomicInteger activeLocks = new AtomicInteger(0);
        when(valOps.setIfAbsent(eq("lock:user:" + singleUserId), anyString(), any(Duration.class)))
                .thenAnswer(invocation -> activeLocks.compareAndSet(0, 1));


        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(threadCount);

        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger lockFailureCount = new AtomicInteger(0);

        for (int i = 0; i < threadCount; i++) {
            executor.submit(() -> {
                TransactionSynchronizationManager.initSynchronization();
                try {
                    startLatch.await();
                    CreateOrderRequest request = new CreateOrderRequest(
                            concertId,
                            List.of(new OrderItemRequest(ticketTypeId, 1))
                    );
                    orderService.createOrder(request, singleUserId, UUID.randomUUID().toString(), "queue-token");
                    successCount.incrementAndGet();
                } catch (AppException e) {
                    if (e.getErrorCode() == ErrorCode.INVALID_REQUEST) {
                        lockFailureCount.incrementAndGet();
                    }
                } catch (Exception e) {
                    // Ignore or log other exceptions
                } finally {
                    TransactionSynchronizationManager.clear();
                    doneLatch.countDown();
                }
            });
        }

        startLatch.countDown();
        doneLatch.await();
        executor.shutdown();

        // The Redis lock ensures only one request is processed at a time for a single user.
        // Therefore, concurrent double-submit requests fail with the lock exception.
        assertTrue(successCount.get() >= 1);
        assertEquals(threadCount, successCount.get() + lockFailureCount.get());
    }
}
