package com.ticketbox.module.payment.application;

import com.ticketbox.shared.exception.AppException;
import org.junit.jupiter.api.Test;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

class PaymentGatewayExecutorTest {
    @Test void rejectedCreateDoesNotQueueAndQueryHasIndependentCapacity() throws Exception {
        var executor = new PaymentGatewayExecutor(1,1);
        var entered = new CountDownLatch(1); var release = new CountDownLatch(1);
        try (var threads = Executors.newSingleThreadExecutor()) {
            var first = threads.submit(() -> executor.create(() -> {
                entered.countDown();
                try { release.await(5,TimeUnit.SECONDS); } catch (InterruptedException exception) { throw new RuntimeException(exception); }
                return "done";
            }));
            assertThat(entered.await(1,TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> executor.create(() -> "cannot run")).isInstanceOf(AppException.class);
            assertThat(executor.query(() -> "query available")).isEqualTo("query available");
            release.countDown(); assertThat(first.get(1,TimeUnit.SECONDS)).isEqualTo("done");
            assertThat(executor.create(() -> "reused")).isEqualTo("reused");
        } finally { release.countDown(); }
    }
    @Test void failureReleasesPermit() {
        var executor = new PaymentGatewayExecutor(1,1);
        assertThatThrownBy(() -> executor.create(() -> { throw new IllegalStateException("fault"); })).isInstanceOf(IllegalStateException.class);
        assertThat(executor.create(() -> "ok")).isEqualTo("ok");
    }
}
