package org.ticketbox.catalog.performance.domain;

import java.awt.geom.Area;
import java.awt.geom.Path2D;
import java.awt.geom.Line2D;
import java.time.DateTimeException;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;
import org.ticketbox.catalog.domain.DomainViolation;
import org.ticketbox.catalog.performance.domain.PerformanceLayout.Kind;
import org.ticketbox.catalog.performance.domain.PerformanceLayout.Point;

public final class PerformanceRules {
    private PerformanceRules() {}

    public static void validateSchedule(
            OffsetDateTime starts, OffsetDateTime ends, OffsetDateTime doors, String timezone,
            OffsetDateTime saleStart, OffsetDateTime saleEnd, int limit) {
        require(starts != null && ends != null && starts.isBefore(ends), "error.performance.invalid-duration");
        require(doors == null || !doors.isAfter(starts), "error.performance.invalid-doors");
        require(saleStart != null && saleEnd != null && saleStart.isBefore(saleEnd) && !saleEnd.isAfter(starts),
                "error.performance.invalid-sale-window");
        require(limit >= 1 && limit <= 100, "error.performance.invalid-quota");
        try {
            require(timezone != null && ZoneId.getAvailableZoneIds().contains(timezone),
                    "error.performance.invalid-timezone");
        } catch (DateTimeException invalid) {
            throw new DomainViolation("INVALID_REQUEST", "error.performance.invalid-timezone");
        }
    }

    public static void validateLayout(PerformanceLayout layout) {
        require(layout != null && dimension(layout.width()) && dimension(layout.height())
                        && layout.sections() != null && layout.sections().size() <= 500
                        && layout.shapes() != null && layout.shapes().size() <= 500,
                "error.performance.invalid-layout");
        var sectionIds = new HashSet<UUID>();
        var sectionCodes = new HashSet<String>();
        var seatIds = new HashSet<UUID>();
        var sectionAreas = new ArrayList<Area>();
        for (var shape : layout.shapes()) {
            require(shape != null && shape.kind() != null && List.of("STAGE", "AISLE", "LANDMARK").contains(shape.kind())
                            && text(shape.label(), 200), "error.performance.invalid-shape");
            polygon(shape.points(), layout);
        }
        for (var section : layout.sections()) {
            require(section != null && section.id() != null && sectionIds.add(section.id())
                            && text(section.code(), 100) && sectionCodes.add(section.code())
                            && text(section.label(), 200) && section.kind() != null
                            && section.rows() != null && section.rows().size() <= 1000
                            && (section.kind() == Kind.ASSIGNED || section.rows().isEmpty()),
                    "error.performance.invalid-section");
            var polygon = polygon(section.points(), layout);
            var area = new Area(polygon);
            for (Area other : sectionAreas) {
                if (area.getBounds2D().intersects(other.getBounds2D())) {
                    var overlap = new Area(area);
                    overlap.intersect(other);
                    require(overlap.isEmpty(), "error.performance.overlapping-sections");
                }
            }
            sectionAreas.add(area);
            var rowIds = new HashSet<UUID>();
            var rowCodes = new HashSet<String>();
            for (var row : section.rows()) {
                require(row != null && row.id() != null && rowIds.add(row.id())
                                && text(row.code(), 100) && rowCodes.add(row.code()) && text(row.label(), 200)
                                && row.seats() != null && row.seats().size() <= 1000,
                        "error.performance.invalid-row");
                var seatLabels = new HashSet<String>();
                var positions = new HashSet<SeatPosition>();
                for (var seat : row.seats()) {
                    require(seat != null && seat.id() != null && seatIds.add(seat.id())
                                    && text(seat.label(), 100) && seatLabels.add(seat.label()),
                            "error.performance.duplicate-seat");
                    require(insideCanvas(seat.x(), seat.y(), layout)
                                    && contains(polygon, section.points(), seat.x(), seat.y()),
                            "error.performance.seat-outside-section", section.code(), row.code(), seat.label());
                    require((seat.segment() == null && seat.position() == null)
                                    || (text(seat.segment(), 100) && seat.position() != null && seat.position() >= 0
                                    && positions.add(new SeatPosition(seat.segment(), seat.position()))),
                            "error.performance.invalid-seat-position");
                    require(seatIds.size() <= 100_000, "error.performance.too-many-seats");
                }
            }
        }
    }

    public static void validateSale(
            PerformanceSale sale, OffsetDateTime start, OffsetDateTime end, PerformanceLayout layout,
            boolean publishing, int maxPerAccount) {
        require(sale != null && sale.groups() != null && sale.groups().size() <= 2_000
                        && sale.offers() != null && sale.offers().size() <= 4_000,
                "error.performance.invalid-sale");
        var sections = new HashMap<UUID, PerformanceLayout.Section>();
        var seats = new HashMap<UUID, MappedSeat>();
        if (layout != null) {
            for (var section : layout.sections()) {
                sections.put(section.id(), section);
                for (var row : section.rows()) {
                    for (var seat : row.seats()) {
                        seats.put(seat.id(), new MappedSeat(section.id(), row.label(), seat));
                    }
                }
            }
        }
        var groupIds = new HashSet<UUID>();
        var usedSeats = new HashSet<UUID>();
        var gaSections = new HashSet<UUID>();
        var maplessGroups = new HashSet<String>();
        for (var group : sale.groups()) {
            require(group != null && group.id() != null && groupIds.add(group.id()) && group.kind() != null
                            && group.seats() != null && group.capacity() > 0 && text(group.sectionLabel(), 200),
                    "error.performance.invalid-group");
            var section = sections.get(group.sectionId());
            if (layout != null || publishing) {
                require(group.sectionId() == null
                                ? group.kind() == Kind.GA && layout == null
                                : section != null && section.kind() == group.kind()
                                    && section.label().equals(group.sectionLabel()),
                        "error.performance.layout-group-mismatch");
            }
            require(group.kind() != Kind.GA || (group.seats().isEmpty() && (group.sectionId() == null
                            ? maplessGroups.add(group.sectionLabel()) : gaSections.add(group.sectionId()))),
                    "error.performance.invalid-ga-group");
            if (group.kind() == Kind.ASSIGNED) {
                int active = 0;
                for (var seat : group.seats()) {
                    require(seat != null && seat.id() != null && usedSeats.add(seat.id())
                                    && text(seat.rowLabel(), 200) && text(seat.seatLabel(), 100),
                            "error.performance.duplicate-seat");
                    if (layout != null || publishing) {
                        var mapped = seats.get(seat.id());
                        require(mapped != null && mapped.section().equals(group.sectionId())
                                        && mapped.row().equals(seat.rowLabel())
                                        && mapped.seat().label().equals(seat.seatLabel())
                                        && mapped.seat().blocked() == seat.blocked(),
                                "error.performance.layout-group-mismatch");
                    }
                    if (!seat.blocked()) active++;
                }
                require(group.capacity() == active, "error.performance.invalid-assigned-capacity");
            }
        }
        var offerIds = new HashSet<UUID>();
        for (var offer : sale.offers()) {
            require(offer != null && offer.id() != null && offerIds.add(offer.id())
                            && groupIds.contains(offer.groupId()) && text(offer.name(), 200)
                            && "VND".equals(offer.currency()) && offer.price() != null
                            && offer.price().signum() > 0 && offer.price().stripTrailingZeros().scale() <= 0
                            && offer.price().compareTo(java.math.BigDecimal.valueOf(999_999_999_999L)) <= 0,
                    "error.performance.invalid-offer");
            require(offer.saleStartAt() != null && offer.saleEndAt() != null
                            && !offer.saleStartAt().isBefore(start) && !offer.saleEndAt().isAfter(end)
                            && offer.saleStartAt().isBefore(offer.saleEndAt()),
                    "error.performance.invalid-offer-window");
        }
        var groupsById = new HashMap<UUID, PerformanceSale.Group>();
        for (var group : sale.groups()) groupsById.put(group.id(), group);
        for (var offer : sale.offers()) {
            require(offer.description() == null || offer.description().length() <= 500,
                    "error.performance.invalid-offer-description");
            require(offer.minPerOrder() >= 1 && offer.minPerOrder() <= 100, "error.performance.invalid-offer-min");
            require(offer.minPerOrder() <= maxPerAccount, "error.performance.offer-min-above-limit");
            var group = groupsById.get(offer.groupId());
            // General admission capacity, or the number of sellable seats of a seated pool.
            require(offer.minPerOrder() <= group.capacity(),
                    "error.performance.offer-min-above-capacity");
        }
        if (publishing) {
            require(sale.offers().stream().anyMatch(PerformanceSale.Offer::active), "error.performance.missing-offer");
            require(seats.entrySet().stream().allMatch(entry -> entry.getValue().seat().blocked()
                            || usedSeats.contains(entry.getKey())), "error.performance.ungrouped-seat");
        }
    }

    public static boolean text(String value, int maximum) {
        return value != null && !value.isBlank() && value.length() <= maximum;
    }

    private record SeatPosition(String segment, int position) {}

    private record MappedSeat(UUID section, String row, PerformanceLayout.Seat seat) {}

    private static boolean dimension(double value) {
        return value > 0 && value <= 1_000_000;
    }

    private static boolean insideCanvas(double x, double y, PerformanceLayout layout) {
        return x >= 0 && x <= layout.width() && y >= 0 && y <= layout.height();
    }

    private static Path2D polygon(List<Point> points, PerformanceLayout layout) {
        require(points != null && points.size() >= 3 && points.size() <= 128, "error.performance.invalid-polygon");
        var path = new Path2D.Double();
        for (int i = 0; i < points.size(); i++) {
            Point point = points.get(i);
            require(point != null && insideCanvas(point.x(), point.y(), layout), "error.performance.invalid-coordinate");
            if (i == 0) path.moveTo(point.x(), point.y());
            else path.lineTo(point.x(), point.y());
        }
        path.closePath();
        require(!new Area(path).isEmpty(), "error.performance.invalid-polygon");
        for (int i = 0; i < points.size(); i++) {
            Point from = points.get(i);
            Point to = points.get((i + 1) % points.size());
            require(!from.equals(to), "error.performance.invalid-polygon");
            for (int j = i + 2; j < points.size() - (i == 0 ? 1 : 0); j++) {
                Point otherFrom = points.get(j);
                Point otherTo = points.get((j + 1) % points.size());
                require(!Line2D.linesIntersect(from.x(), from.y(), to.x(), to.y(),
                                otherFrom.x(), otherFrom.y(), otherTo.x(), otherTo.y()),
                        "error.performance.invalid-polygon");
            }
        }
        return path;
    }

    private static boolean contains(Path2D polygon, List<Point> points, double x, double y) {
        if (polygon.contains(x, y)) return true;
        for (int i = 0; i < points.size(); i++) {
            Point a = points.get(i);
            Point b = points.get((i + 1) % points.size());
            if (Line2D.ptSegDist(a.x(), a.y(), b.x(), b.y(), x, y) < 1e-7) return true;
        }
        return false;
    }

    private static void require(boolean condition, String message, Object... values) {
        if (!condition) throw new DomainViolation("INVALID_REQUEST", message, values);
    }
}
