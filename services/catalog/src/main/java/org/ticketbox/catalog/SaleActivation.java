package org.ticketbox.catalog;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.*;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

@Aspect
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class SaleActivation {
    private final CatalogPublisher publisher;

    public SaleActivation(CatalogPublisher publisher) {
        this.publisher = publisher;
    }

    @Around("execution(* com.ticketbox.module.concert.application.ConcertService.createConcert(..))"
            + " || execution(* com.ticketbox.module.concert.application.ConcertService.updateConcert(..))"
            + " || execution(* com.ticketbox.module.concert.application.ConcertService.changeStatus(..))"
            + " || execution(* com.ticketbox.module.concert.application.ConcertService.deleteConcert(..))"
            + " || execution(* com.ticketbox.module.concert.application.TicketTypeService.createTicketType(..))"
            + " || execution(* com.ticketbox.module.concert.application.TicketTypeService.updateTicketType(..))"
            + " || execution(* com.ticketbox.module.concert.application.TicketTypeService.changeStatus(..))"
            + " || execution(* com.ticketbox.module.concert.application.TicketTypeService.deleteTicketType(..))")
    public Object acknowledge(ProceedingJoinPoint call) throws Throwable {
        Object result = call.proceed();
        publisher.acknowledgeSales();
        return result;
    }
}
