package org.ticketbox.ticketing.persistence;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.*;
import org.springframework.core.annotation.Order;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Aspect
@Order(-10) // Select intent before the transaction interceptor acquires a connection.
public class ReplicaReadAspect {
    private static final ThreadLocal<Boolean> INTENT = new ThreadLocal<>();

    static boolean requested() { return Boolean.TRUE.equals(INTENT.get()); }

    @Around("@annotation(org.ticketbox.ticketing.persistence.ReplicaRead)")
    public Object read(ProceedingJoinPoint invocation) throws Throwable {
        // A nested query cannot change the consistency of an existing transaction.
        if (TransactionSynchronizationManager.isActualTransactionActive()) return invocation.proceed();
        Boolean previous = INTENT.get();
        INTENT.set(true);
        try { return invocation.proceed(); }
        finally {
            if (previous == null) INTENT.remove(); else INTENT.set(previous);
        }
    }
}
