package org.ticketbox.identity.organization.infrastructure;

import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;

import lombok.extern.slf4j.Slf4j;

import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.ticketbox.identity.application.error.AppException;
import org.ticketbox.identity.application.error.ErrorCode;
import org.ticketbox.identity.config.CloudinaryProperties;
import org.ticketbox.identity.organization.application.port.OrganizationImageStorage;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Component
public class CloudinaryOrganizationImageStorage implements OrganizationImageStorage {
    private final Cloudinary cloudinary;
    private final CloudinaryProperties properties;

    public CloudinaryOrganizationImageStorage(Cloudinary cloudinary, CloudinaryProperties properties) {
        this.cloudinary = cloudinary;
        this.properties = properties;
    }

    @Override
    public StoredImage uploadLogo(UUID organizationId, byte[] bytes) {
        if (!isConfigured()) {
            throw new AppException(ErrorCode.IMAGE_STORAGE_UNAVAILABLE, "error.logo.storage-not-configured");
        }
        try {
            Map<?, ?> result = cloudinary.uploader().upload(bytes, ObjectUtils.asMap("folder", properties.logoFolder(),
                    "public_id", organizationId + "-" + UUID.randomUUID(), "resource_type", "image"));
            if (!(result.get("secure_url") instanceof String url) || !StringUtils.hasText(url)
                    || !(result.get("public_id") instanceof String publicId) || !StringUtils.hasText(publicId)) {
                throw new AppException(ErrorCode.IMAGE_STORAGE_UNAVAILABLE, "error.logo.upload-failed");
            }
            return new StoredImage(url, publicId);
        } catch (AppException exception) {
            throw exception;
        } catch (IOException | RuntimeException exception) {
            log.error("Cloudinary logo upload failed for organization {}", organizationId, exception);
            throw new AppException(ErrorCode.IMAGE_STORAGE_UNAVAILABLE, "error.logo.upload-failed");
        }
    }

    @Override
    public void deleteBestEffort(String publicId) {
        if (!StringUtils.hasText(publicId) || !isConfigured()) return;
        try {
            cloudinary.uploader().destroy(publicId, ObjectUtils.asMap("resource_type", "image", "invalidate", true));
        } catch (IOException | RuntimeException exception) {
            log.warn("Could not delete Cloudinary asset {}", publicId, exception);
        }
    }

    private boolean isConfigured() {
        return StringUtils.hasText(properties.cloudName()) && StringUtils.hasText(properties.apiKey())
                && StringUtils.hasText(properties.apiSecret());
    }
}
