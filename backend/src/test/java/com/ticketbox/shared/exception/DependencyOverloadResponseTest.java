package com.ticketbox.shared.exception;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import java.util.stream.Stream;
import static org.assertj.core.api.Assertions.assertThat;

class DependencyOverloadResponseTest {
    static Stream<RuntimeException> failures() {
        return Stream.of(new org.springframework.dao.DataAccessResourceFailureException("DB unavailable"),
                new org.springframework.data.redis.RedisSystemException("Redis unavailable",new RuntimeException()),
                new org.springframework.dao.QueryTimeoutException("Redis timed out"),
                new org.springframework.transaction.CannotCreateTransactionException("Pool saturated"));
    }
    @ParameterizedTest @MethodSource("failures")
    void dependencyFailureIsRetryableAndNeverClaimsThatThePurchaseSucceeded(RuntimeException failure) {
        var response=new GlobalExceptionHandler().handleResourceUnavailable(failure);
        assertThat(response.getStatusCode().value()).isEqualTo(503);
        assertThat(response.getHeaders().getFirst("Retry-After")).isEqualTo("1");
        assertThat(response.getBody().getCode()).isEqualTo(503);
        assertThat(response.getBody().getData()).isNull();
    }
}
