package org.ticketbox.catalog.concert.infrastructure;

import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;

import lombok.extern.slf4j.Slf4j;

import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.application.error.ErrorCode;
import org.ticketbox.catalog.application.port.Upload;
import org.ticketbox.catalog.concert.application.port.PosterStorage;
import org.ticketbox.catalog.config.CloudinaryProperties;

import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Slf4j
@Component
public class CloudinaryPosterStorage implements PosterStorage {

    private static final Set<String> ALLOWED_CONTENT_TYPES =
            Set.of("image/jpeg", "image/png", "image/webp");

    private final Cloudinary cloudinary;
    private final CloudinaryProperties properties;

    public CloudinaryPosterStorage(Cloudinary cloudinary, CloudinaryProperties properties) {
        this.cloudinary = cloudinary;
        this.properties = properties;
    }

    @Override
    public StoredPoster upload(UUID concertId, Upload file) {
        ensureConfigured();
        byte[] bytes = validateAndRead(file);

        try {
            Map<?, ?> result =
                    cloudinary
                            .uploader()
                            .upload(
                                    bytes,
                                    ObjectUtils.asMap(
                                            "folder",
                                            properties.folder(),
                                            "public_id",
                                            concertId + "-" + UUID.randomUUID(),
                                            "resource_type",
                                            "image"));
            Object secureUrlValue = result.get("secure_url");
            Object publicIdValue = result.get("public_id");
            if (!(secureUrlValue instanceof String secureUrl)
                    || !StringUtils.hasText(secureUrl)
                    || !(publicIdValue instanceof String publicId)
                    || !StringUtils.hasText(publicId)) {
                throw new AppException(
                        ErrorCode.IMAGE_STORAGE_UNAVAILABLE,
                        "error.poster.invalid-upload-response");
            }
            return new StoredPoster(secureUrl, publicId);
        } catch (AppException exception) {
            throw exception;
        } catch (IOException | RuntimeException exception) {
            log.error("Cloudinary poster upload failed for concert {}", concertId, exception);
            throw new AppException(
                    ErrorCode.IMAGE_STORAGE_UNAVAILABLE, "error.poster.upload-failed");
        }
    }

    @Override
    public void deleteBestEffort(String publicId) {
        if (!StringUtils.hasText(publicId) || !isConfigured()) return;
        try {
            cloudinary
                    .uploader()
                    .destroy(
                            publicId,
                            ObjectUtils.asMap("resource_type", "image", "invalidate", true));
        } catch (IOException | RuntimeException exception) {
            log.warn("Could not delete Cloudinary asset {}", publicId, exception);
        }
    }

    private byte[] validateAndRead(Upload file) {
        if (file == null || file.isEmpty()) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.poster.required");
        }
        if (file.getSize() > properties.maxFileSize().toBytes()) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.poster.too-large");
        }
        if (!ALLOWED_CONTENT_TYPES.contains(file.getContentType())) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.poster.unsupported-type");
        }
        try {
            byte[] bytes = file.getBytes();
            if (!matchesSignature(bytes, file.getContentType())) {
                throw new AppException(ErrorCode.INVALID_REQUEST, "error.poster.type-mismatch");
            }
            return bytes;
        } catch (IOException exception) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.poster.read-failed");
        }
    }

    private boolean matchesSignature(byte[] bytes, String contentType) {
        return switch (contentType) {
            case "image/jpeg" ->
                    bytes.length >= 3
                            && unsigned(bytes[0]) == 0xFF
                            && unsigned(bytes[1]) == 0xD8
                            && unsigned(bytes[2]) == 0xFF;
            case "image/png" ->
                    bytes.length >= 8
                            && unsigned(bytes[0]) == 0x89
                            && bytes[1] == 0x50
                            && bytes[2] == 0x4E
                            && bytes[3] == 0x47
                            && bytes[4] == 0x0D
                            && bytes[5] == 0x0A
                            && bytes[6] == 0x1A
                            && bytes[7] == 0x0A;
            case "image/webp" ->
                    bytes.length >= 12
                            && bytes[0] == 'R'
                            && bytes[1] == 'I'
                            && bytes[2] == 'F'
                            && bytes[3] == 'F'
                            && bytes[8] == 'W'
                            && bytes[9] == 'E'
                            && bytes[10] == 'B'
                            && bytes[11] == 'P';
            default -> false;
        };
    }

    private int unsigned(byte value) {
        return value & 0xFF;
    }

    private void ensureConfigured() {
        if (!isConfigured()) {
            throw new AppException(
                    ErrorCode.IMAGE_STORAGE_UNAVAILABLE, "error.poster.storage-not-configured");
        }
    }

    private boolean isConfigured() {
        return StringUtils.hasText(properties.cloudName())
                && StringUtils.hasText(properties.apiKey())
                && StringUtils.hasText(properties.apiSecret());
    }
}
