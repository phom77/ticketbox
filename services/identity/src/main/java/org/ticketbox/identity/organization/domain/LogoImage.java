package org.ticketbox.identity.organization.domain;

/** Checks a logo upload against its declared type and reads its pixel size without decoding it. */
public final class LogoImage {
    public static final int MAX_BYTES = 2 * 1024 * 1024;
    public static final int MIN_SIDE = 128;

    public enum Problem { UNSUPPORTED_TYPE, TOO_LARGE, TYPE_MISMATCH, TOO_SMALL, EMPTY }

    private LogoImage() {}

    /** Returns null when the image is acceptable. */
    public static Problem check(byte[] bytes, String contentType) {
        if (bytes == null || bytes.length == 0) return Problem.EMPTY;
        if (contentType == null) return Problem.UNSUPPORTED_TYPE;
        if (!contentType.equals("image/jpeg") && !contentType.equals("image/png")
                && !contentType.equals("image/webp")) return Problem.UNSUPPORTED_TYPE;
        if (bytes.length > MAX_BYTES) return Problem.TOO_LARGE;
        int[] size = switch (contentType) {
            case "image/png" -> png(bytes);
            case "image/jpeg" -> jpeg(bytes);
            default -> webp(bytes);
        };
        if (size == null) return Problem.TYPE_MISMATCH;
        return size[0] < MIN_SIDE || size[1] < MIN_SIDE ? Problem.TOO_SMALL : null;
    }

    static int[] png(byte[] b) {
        if (b.length < 24 || (b[0] & 0xFF) != 0x89 || b[1] != 'P' || b[2] != 'N' || b[3] != 'G'
                || b[4] != 0x0D || b[5] != 0x0A || b[6] != 0x1A || b[7] != 0x0A) return null;
        return new int[] {be32(b, 16), be32(b, 20)};
    }

    static int[] jpeg(byte[] b) {
        if (b.length < 4 || (b[0] & 0xFF) != 0xFF || (b[1] & 0xFF) != 0xD8) return null;
        int i = 2;
        while (i + 9 < b.length) {
            if ((b[i] & 0xFF) != 0xFF) { i++; continue; }
            int marker = b[i + 1] & 0xFF;
            if (marker == 0xFF) { i++; continue; }
            if (marker == 0xD8 || marker == 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { i += 2; continue; }
            int length = ((b[i + 2] & 0xFF) << 8) | (b[i + 3] & 0xFF);
            boolean frame = marker >= 0xC0 && marker <= 0xCF && marker != 0xC4 && marker != 0xC8 && marker != 0xCC;
            if (frame) {
                return new int[] {((b[i + 7] & 0xFF) << 8) | (b[i + 8] & 0xFF),
                        ((b[i + 5] & 0xFF) << 8) | (b[i + 6] & 0xFF)};
            }
            i += 2 + length;
        }
        return null;
    }

    static int[] webp(byte[] b) {
        if (b.length < 30 || b[0] != 'R' || b[1] != 'I' || b[2] != 'F' || b[3] != 'F'
                || b[8] != 'W' || b[9] != 'E' || b[10] != 'B' || b[11] != 'P') return null;
        String chunk = new String(b, 12, 4, java.nio.charset.StandardCharsets.US_ASCII);
        return switch (chunk) {
            case "VP8X" -> new int[] {le24(b, 24) + 1, le24(b, 27) + 1};
            case "VP8L" -> {
                if ((b[20] & 0xFF) != 0x2F) yield null;
                int bits = (b[21] & 0xFF) | ((b[22] & 0xFF) << 8) | ((b[23] & 0xFF) << 16) | ((b[24] & 0xFF) << 24);
                yield new int[] {(bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1};
            }
            case "VP8 " -> {
                if ((b[23] & 0xFF) != 0x9D || (b[24] & 0xFF) != 0x01 || (b[25] & 0xFF) != 0x2A) yield null;
                yield new int[] {((b[26] & 0xFF) | ((b[27] & 0xFF) << 8)) & 0x3FFF,
                        ((b[28] & 0xFF) | ((b[29] & 0xFF) << 8)) & 0x3FFF};
            }
            default -> null;
        };
    }

    private static int be32(byte[] b, int at) {
        return ((b[at] & 0xFF) << 24) | ((b[at + 1] & 0xFF) << 16) | ((b[at + 2] & 0xFF) << 8) | (b[at + 3] & 0xFF);
    }

    private static int le24(byte[] b, int at) {
        return (b[at] & 0xFF) | ((b[at + 1] & 0xFF) << 8) | ((b[at + 2] & 0xFF) << 16);
    }
}
