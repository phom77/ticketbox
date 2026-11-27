package org.ticketbox.catalog.performance.application;

import java.time.DateTimeException;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.application.error.ErrorCode;
import org.ticketbox.catalog.domain.DomainViolation;
import org.ticketbox.catalog.performance.application.PerformanceViews.Layout;
import org.ticketbox.catalog.performance.application.PerformanceViews.Performance;
import org.ticketbox.catalog.performance.domain.PerformanceRules;
import org.ticketbox.catalog.performance.domain.PerformanceSale;

/**
 * Creates draft performances in bulk, duplicates a performance and copies pricing to other draft dates. Each
 * operation runs in one transaction under the event lock, so it applies to every date or to none.
 */
@Service
public class PerformanceScheduling {
    public static final int MAX_BULK_DATES = 30;

    private final PerformanceStore store;
    private final EventContentStore audit;

    public PerformanceScheduling(PerformanceStore store, EventContentStore audit) {
        this.store = store;
        this.audit = audit;
    }

    public record Bulk(List<OffsetDateTime> startsAt, UUID sourcePerformanceId, UUID venueSpaceId,
                       Integer durationMinutes, Integer doorsBeforeMinutes, OffsetDateTime saleStartAt,
                       String timezone) {}

    public record Target(UUID performanceId, Long expectedSaleVersion) {}

    public record Applied(UUID performanceId, long saleVersion) {}

    @Transactional
    public List<Performance> bulk(UUID owner, UUID actor, UUID event, Bulk request) {
        if (request == null || request.startsAt() == null || request.startsAt().isEmpty()) {
            throw invalid("error.performance.bulk-empty");
        }
        if (request.startsAt().size() > MAX_BULK_DATES) throw invalid("error.performance.bulk-too-many");
        if (store.lockNativeEventVersion(event, owner).isEmpty()) throw missing();
        var now = OffsetDateTime.now();
        var source = request.sourcePerformanceId() == null ? null : sourceOf(owner, event, request.sourcePerformanceId());
        Set<Long> seen = new HashSet<>();
        List<OffsetDateTime> failing = new ArrayList<>();
        for (var start : request.startsAt()) {
            if (start == null || !start.isAfter(now) || !seen.add(start.toInstant().toEpochMilli())) failing.add(start);
        }
        if (source == null) {
            var plan = plan(owner, request);
            if (plan.saleStart() != null && !plan.saleStart().isAfter(now)) {
                throw invalid("error.performance.bulk-sale-start-past");
            }
            for (var start : request.startsAt()) {
                if (start != null && start.isAfter(now) && !failing.contains(start)
                        && !plan.fits(start)) failing.add(start);
            }
        }
        if (!failing.isEmpty()) {
            throw new AppException(ErrorCode.UNPROCESSABLE, "error.performance.bulk-invalid-dates",
                    failing.stream().map(value -> value == null ? "?" : value.toString()).collect(Collectors.joining(", ")));
        }
        var created = new ArrayList<Performance>();
        if (source != null) {
            var content = Content.of(store, source);
            for (var start : request.startsAt()) created.add(copy(owner, source, content, start, now));
        } else {
            var plan = plan(owner, request);
            for (var start : request.startsAt()) {
                created.add(store.createPerformance(UUID.randomUUID(), event, request.venueSpaceId(), start,
                        start.plusMinutes(plan.duration()), start.minusMinutes(plan.doorsBefore()), plan.timezone(),
                        request.saleStartAt(), start, 4, true));
            }
        }
        audit.audit(actor, owner, "PERFORMANCES_BULK_CREATED", event, created.size() + " dates");
        return created;
    }

    @Transactional
    public Performance duplicate(UUID owner, UUID actor, UUID sourceId, OffsetDateTime startsAt) {
        var event = store.ownedEvent(sourceId, owner).orElseThrow(PerformanceScheduling::missing);
        if (store.lockNativeEventVersion(event, owner).isEmpty()) throw missing();
        var source = store.lockOwnedPerformance(sourceId, owner).orElseThrow(PerformanceScheduling::missing);
        var now = OffsetDateTime.now();
        if (startsAt == null || !startsAt.isAfter(now)) throw invalid("error.performance.invalid-duration");
        var copy = copy(owner, source, Content.of(store, source), startsAt, now);
        audit.audit(actor, owner, "PERFORMANCE_DUPLICATED", copy.id(), "from " + sourceId);
        return copy;
    }

    @Transactional
    public List<Applied> applyPricing(UUID owner, UUID actor, UUID sourceId, List<Target> targets) {
        if (targets == null || targets.isEmpty() || targets.size() > MAX_BULK_DATES) {
            throw invalid("error.performance.apply-targets");
        }
        var event = store.ownedEvent(sourceId, owner).orElseThrow(PerformanceScheduling::missing);
        if (store.lockNativeEventVersion(event, owner).isEmpty()) throw missing();
        var source = store.lockOwnedPerformance(sourceId, owner).orElseThrow(PerformanceScheduling::missing);
        var pricing = store.sale(sourceId);
        var applied = new ArrayList<Applied>();
        Set<UUID> done = new LinkedHashSet<>();
        for (var target : targets) {
            if (target == null || target.performanceId() == null || target.expectedSaleVersion() == null
                    || target.performanceId().equals(sourceId) || !done.add(target.performanceId())) {
                throw invalid("error.performance.apply-targets");
            }
            var destination = store.lockOwnedPerformance(target.performanceId(), owner)
                    .orElseThrow(PerformanceScheduling::missing);
            String label = destination.startsAt().toString();
            if (!destination.eventId().equals(source.eventId())) throw refused("error.performance.apply-other-event", label);
            if (!"DRAFT".equals(destination.status()) || store.hasPendingReview(destination.id())) {
                throw refused("error.performance.apply-not-draft", label);
            }
            if (target.expectedSaleVersion() != destination.saleVersion()) {
                throw new AppException(ErrorCode.PERFORMANCE_VERSION_CONFLICT, "error.performance.apply-stale", label);
            }
            var current = store.sale(destination.id());
            if (!samePools(pricing, current)) throw refused("error.performance.apply-pools", label);
            var sale = new PerformanceSale(current.groups(), retarget(pricing, current, source, destination));
            var layout = store.draftLayout(destination.id()).map(Layout::layout).orElse(null);
            try {
                PerformanceRules.validateSale(sale, destination.saleStartAt(), destination.saleEndAt(), layout,
                        false, destination.maxPerAccount());
            } catch (DomainViolation invalid) {
                throw refused("error.performance.apply-window", label);
            }
            long version = destination.saleVersion() + 1;
            store.saveSale(destination.id(), version, sale);
            applied.add(new Applied(destination.id(), version));
        }
        audit.audit(actor, owner, "PERFORMANCE_PRICING_APPLIED", sourceId, applied.size() + " dates");
        return applied;
    }

    /** The pools of two sales match when each group id exists in both with the same kind and capacity. */
    static boolean samePools(PerformanceSale source, PerformanceSale target) {
        Map<UUID, String> left = source.groups().stream().collect(Collectors.toMap(PerformanceSale.Group::id,
                group -> group.kind() + ":" + group.capacity()));
        Map<UUID, String> right = target.groups().stream().collect(Collectors.toMap(PerformanceSale.Group::id,
                group -> group.kind() + ":" + group.capacity()));
        return left.equals(right);
    }

    /** Source offers for a target: ids kept for same name and pool, windows shifted to the target start. */
    private static List<PerformanceSale.Offer> retarget(
            PerformanceSale pricing, PerformanceSale current, Performance source, Performance destination) {
        var delta = Duration.between(source.startsAt(), destination.startsAt());
        var offers = new ArrayList<PerformanceSale.Offer>();
        Set<UUID> used = new HashSet<>();
        for (var offer : pricing.offers()) {
            var existing = current.offers().stream().filter(value -> value.groupId().equals(offer.groupId())
                    && value.name().equals(offer.name())).findFirst();
            OffsetDateTime start = offer.saleStartAt().plus(delta);
            OffsetDateTime end = offer.saleEndAt().plus(delta);
            if (destination.saleStartAt() != null && start.isBefore(destination.saleStartAt())) start = destination.saleStartAt();
            if (end.isAfter(destination.saleEndAt())) end = destination.saleEndAt();
            UUID id = existing.map(PerformanceSale.Offer::id).orElseGet(UUID::randomUUID);
            // Two source offers can share a name and pool; never give both the same existing id.
            while (!used.add(id)) id = UUID.randomUUID();
            offers.add(new PerformanceSale.Offer(id,
                    offer.groupId(), offer.name(), offer.price(), offer.currency(), start, end, offer.active(),
                    offer.description(), offer.minPerOrder()));
        }
        return offers;
    }

    private Performance sourceOf(UUID owner, UUID event, UUID id) {
        var source = store.lockOwnedPerformance(id, owner).orElseThrow(PerformanceScheduling::missing);
        if (!source.eventId().equals(event)) throw missing();
        return source;
    }

    private Performance copy(UUID owner, Performance source, Content content, OffsetDateTime start, OffsetDateTime now) {
        var delta = Duration.between(source.startsAt(), start);
        OffsetDateTime saleStart = source.saleStartAt() == null ? null : source.saleStartAt().plus(delta);
        if (saleStart != null && !saleStart.isAfter(now)) saleStart = null;
        UUID id = UUID.randomUUID();
        var created = store.createPerformance(id, source.eventId(), source.venueSpaceId(), start,
                source.endsAt().plus(delta), source.doorsOpenAt() == null ? null : source.doorsOpenAt().plus(delta),
                source.timezone(), saleStart, source.saleEndAt().plus(delta), source.maxPerAccount(),
                source.publicVisible());
        if (content.layout() != null) {
            store.saveDraftLayout(id, 1, relocate(owner, source, id, content));
        }
        if (!content.sale().groups().isEmpty()) {
            var offers = content.sale().offers().stream().map(offer -> new PerformanceSale.Offer(UUID.randomUUID(),
                    offer.groupId(), offer.name(), offer.price(), offer.currency(), offer.saleStartAt().plus(delta),
                    offer.saleEndAt().plus(delta), offer.active(), offer.description(), offer.minPerOrder())).toList();
            store.saveSale(id, 1, new PerformanceSale(content.sale().groups(), offers));
            return store.lockOwnedPerformance(id, owner).orElse(created);
        }
        return created;
    }

    /** The map background is stored per performance, so the copy gets its own asset. */
    private org.ticketbox.catalog.performance.domain.PerformanceLayout relocate(
            UUID owner, Performance source, UUID target, Content content) {
        var layout = content.layout();
        if (layout.backgroundUrl() == null) return layout;
        try {
            UUID asset = UUID.fromString(layout.backgroundUrl().substring(layout.backgroundUrl().lastIndexOf('/') + 1));
            var image = store.draftBackground(asset, source.id(), owner).orElse(null);
            if (image == null) return layout.withBackground(null);
            UUID copy = UUID.randomUUID();
            store.storeBackground(copy, owner, target, image);
            return layout.withBackground(PerformanceCatalog.privateBackgroundUrl(target, copy));
        } catch (IllegalArgumentException malformed) {
            return layout.withBackground(null);
        }
    }

    private record Content(PerformanceSale sale, org.ticketbox.catalog.performance.domain.PerformanceLayout layout) {
        static Content of(PerformanceStore store, Performance source) {
            return new Content(store.sale(source.id()), store.draftLayout(source.id()).map(Layout::layout).orElse(null));
        }
    }

    private record Plan(String timezone, int duration, int doorsBefore, OffsetDateTime saleStart) {
        boolean fits(OffsetDateTime start) {
            return saleStart == null || saleStart.isBefore(start);
        }
    }

    private Plan plan(UUID owner, Bulk request) {
        if (request.venueSpaceId() == null || !store.ownsSpace(request.venueSpaceId(), owner)) throw missing();
        int duration = request.durationMinutes() == null ? 120 : request.durationMinutes();
        int doors = request.doorsBeforeMinutes() == null ? 30 : request.doorsBeforeMinutes();
        if (duration < 1 || duration > 24 * 60 * 7) throw invalid("error.performance.invalid-duration");
        if (doors < 0 || doors > 24 * 60) throw invalid("error.performance.invalid-doors");
        String zone = request.timezone();
        try {
            if (zone == null || !ZoneId.getAvailableZoneIds().contains(zone)) throw invalid("error.performance.invalid-timezone");
        } catch (DateTimeException failure) {
            throw invalid("error.performance.invalid-timezone");
        }
        return new Plan(zone, duration, doors, request.saleStartAt());
    }

    private static AppException refused(String key, String label) {
        return new AppException(ErrorCode.UNPROCESSABLE, key, label);
    }

    private static AppException invalid(String key) {
        return new AppException(ErrorCode.INVALID_REQUEST, key);
    }

    private static AppException missing() {
        return new AppException(ErrorCode.RESOURCE_NOT_FOUND, "error.performance.not-found");
    }
}
