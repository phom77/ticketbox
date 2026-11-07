package org.ticketbox.catalog.sales.infrastructure;

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

    @Around(
            "execution(*"
                + " org.ticketbox.catalog.concert.application.ConcertService.createConcert(..)) ||"
                + " execution(*"
                + " org.ticketbox.catalog.concert.application.ConcertService.updateConcert(..)) ||"
                + " execution(*"
                + " org.ticketbox.catalog.concert.application.ConcertService.changeStatus(..)) ||"
                + " execution(*"
                + " org.ticketbox.catalog.concert.application.ConcertService.deleteConcert(..)) ||"
                + " execution(*"
                + " org.ticketbox.catalog.sales.application.TicketTypeService.createTicketType(..))"
                + " || execution(*"
                + " org.ticketbox.catalog.sales.application.TicketTypeService.updateTicketType(..))"
                + " || execution(*"
                + " org.ticketbox.catalog.sales.application.TicketTypeService.changeStatus(..)) ||"
                + " execution(*"
                + " org.ticketbox.catalog.sales.application.TicketTypeService.deleteTicketType(..))")
    public Object acknowledge(ProceedingJoinPoint call) throws Throwable {
        Object result = call.proceed();
        publisher.acknowledgeSales();
        return result;
    }
}
