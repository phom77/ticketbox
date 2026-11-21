package org.ticketbox.catalog.performance.domain;

import java.util.List;
import java.util.UUID;

public record PerformanceLayout(
        double width, double height, String backgroundUrl, List<Shape> shapes, List<Section> sections) {

    public record Point(double x, double y) {}

    public record Shape(String kind, String label, List<Point> points) {}

    public record Section(UUID id, String code, String label, Kind kind, List<Point> points, List<Row> rows) {
        public SectionSummary summary() {
            return new SectionSummary(id, code, label, kind, points);
        }
    }

    public record SectionSummary(UUID id, String code, String label, Kind kind, List<Point> points) {}

    public record Row(UUID id, String code, String label, List<Seat> seats) {}

    public record Seat(
            UUID id, String label, double x, double y, boolean accessible, boolean restrictedView,
            String segment, Integer position, boolean blocked) {}

    public enum Kind { GA, ASSIGNED }

    public PerformanceLayout withBackground(String url) {
        return new PerformanceLayout(width, height, url, shapes, sections);
    }
}
