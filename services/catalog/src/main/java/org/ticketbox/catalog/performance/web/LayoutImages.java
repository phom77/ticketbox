package org.ticketbox.catalog.performance.web;

import java.io.IOException;
import java.util.Locale;
import java.util.Map;
import javax.imageio.ImageIO;
import javax.imageio.stream.MemoryCacheImageInputStream;
import org.springframework.web.multipart.MultipartFile;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.application.error.ErrorCode;
import org.ticketbox.catalog.performance.application.PerformanceViews.Background;

final class LayoutImages {
    private static final long MAX_BYTES = 5L * 1024 * 1024;
    private static final Map<String, String> FORMATS = Map.of("jpeg", "image/jpeg", "png", "image/png");

    private LayoutImages() {}

    static Background read(MultipartFile file) {
        if (file.isEmpty() || file.getSize() > MAX_BYTES) throw invalid();

        try (var stream = file.getInputStream(); var image = new MemoryCacheImageInputStream(stream)) {
            var readers = ImageIO.getImageReaders(image);
            if (!readers.hasNext()) throw invalid();
            var reader = readers.next();
            try {
                String mediaType = FORMATS.get(reader.getFormatName().toLowerCase(Locale.ROOT));
                if (mediaType == null || !mediaType.equals(file.getContentType())) throw invalid();
                reader.setInput(image, true, true);
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                if (width < 1 || height < 1 || (long) width * height > 25_000_000) throw invalid();
                return new Background(mediaType, file.getBytes());
            } finally {
                reader.dispose();
            }
        } catch (IOException failure) {
            throw invalid();
        }
    }

    private static AppException invalid() {
        return new AppException(ErrorCode.INVALID_REQUEST, "error.performance.invalid-background");
    }
}
