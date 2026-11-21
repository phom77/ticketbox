package org.ticketbox.ticketing.queue.domain;

public final class AdmissionPolicy {
    private static final int REALTIME_RANK_LIMIT = 1000;

    private AdmissionPolicy() {}

    public static boolean nearFront(QueueStatus status, Integer rank) {
        return status == QueueStatus.WAITING && rank != null && rank <= REALTIME_RANK_LIMIT;
    }

    public static Long pollAfterMs(QueueStatus status, Integer rank) {
        if (status == QueueStatus.WAITING_ROOM) return 60_000L;
        if (status != QueueStatus.WAITING || rank == null) return null;
        if (nearFront(status, rank)) return 5_000L;
        return rank <= 10_000 ? 20_000L : 60_000L;
    }

    public static int target(long peak) {
        long perSecond = peak / 1800 + (peak % 1800 == 0 ? 0 : 1);
        return (int) Math.clamp(perSecond, 5, 60);
    }

    public static int capacity(int rate) {
        return (int) Math.min(10_000, rate * 144L);
    }

    public static int sharedLimit(double purchasePerSecond, double paymentPerSecond) {
        return (int) Math.min(0.8 * purchasePerSecond / 3, 0.8 * paymentPerSecond / 2);
    }

    public static State initial(long waiting) {
        return new State(waiting, Math.min(target(waiting), 20), 0);
    }

    public enum Health {
        HEALTHY, SPARSE, OVERLOADED
    }

    public record Sample(long total, long slow, long failures, boolean unavailable) {
        public static final Sample EMPTY = new Sample(0, 0, 0, false);

        boolean overloaded() {
            long processed = total - failures;
            return unavailable || slow > processed * 0.05
                    || (failures > 0 && failures >= total * 0.01);
        }
    }

    public static Health health(Sample first, Sample second) {
        if (first.overloaded() || second.overloaded()) return Health.OVERLOADED;
        return first.total() + second.total() >= 20 ? Health.HEALTHY : Health.SPARSE;
    }

    public record State(long peak, int rate, int healthyWindows) {
        public State withWaiting(long waiting) {
            if (waiting == 0 || peak == 0) return initial(waiting);
            return new State(Math.max(peak, waiting), rate, healthyWindows);
        }

        public State advance(Health health, int target) {
            return switch (health) {
                case OVERLOADED -> new State(peak, Math.max(1, rate / 2), 0);
                case SPARSE -> new State(peak, Math.min(rate, target), 0);
                case HEALTHY -> healthyWindows == 1
                        ? new State(peak, Math.min(rate + 5, target), 0)
                        : new State(peak, Math.min(rate, target), 1);
            };
        }
    }
}
