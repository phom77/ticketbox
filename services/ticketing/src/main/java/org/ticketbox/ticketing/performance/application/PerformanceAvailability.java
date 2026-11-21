package org.ticketbox.ticketing.performance.application;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.application.error.ErrorCode;
import org.ticketbox.ticketing.performance.application.port.PerformanceStock;
import org.ticketbox.ticketing.performance.application.port.PerformanceStock.Offer;
import org.ticketbox.ticketing.performance.application.port.PerformanceStock.Sale;
import org.ticketbox.ticketing.performance.domain.PerformanceSale.Kind;

@Service
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class PerformanceAvailability {
    private final PerformanceStock stock;

    public PerformanceAvailability(PerformanceStock stock) {
        this.stock = stock;
    }

    public Overview overview(UUID performanceId) {
        var sale = publicSale(performanceId);
        var now = OffsetDateTime.now();
        var offers = stock.offers(performanceId).stream().collect(Collectors.groupingBy(Offer::groupId));
        return new Overview(sale.layoutVersion(), sale.saleVersion(), stock.groups(performanceId).stream()
                .map(group -> new GroupView(group.id(), group.sectionId(), group.sectionLabel(), group.kind(),
                        group.available(), offers.getOrDefault(group.id(), List.of()).stream()
                                .map(offer -> new OfferView(offer.id(), offer.name(), offer.price(),
                                        sale.onSale() && !sale.suspended() && offer.activeAt(now)))
                                .toList())).toList());
    }

    public Section section(UUID performanceId, UUID sectionId) {
        var sale = publicSale(performanceId);
        if (!stock.hasSection(performanceId, sectionId)) {
            throw new AppException(ErrorCode.RESOURCE_NOT_FOUND);
        }
        return new Section(sale.layoutVersion(), sale.saleVersion(), sectionId, stock.seats(performanceId, sectionId)
                .stream().map(seat -> new SeatView(seat.id(), seat.available(), seat.groupId())).toList());
    }

    private Sale publicSale(UUID id) {
        return stock.sale(id, false).filter(Sale::publicVisible)
                .orElseThrow(() -> new AppException(ErrorCode.CONCERT_NOT_FOUND));
    }

    public record Overview(Long layoutVersion, long saleVersion, List<GroupView> groups) {}
    public record GroupView(UUID id, UUID sectionId, String sectionLabel, Kind kind, int available,
                            List<OfferView> offers) {}
    public record OfferView(UUID id, String name, BigDecimal price, boolean active) {}
    public record Section(Long layoutVersion, long saleVersion, UUID sectionId, List<SeatView> seats) {}
    public record SeatView(UUID id, boolean available, UUID groupId) {}
}
