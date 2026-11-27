package org.ticketbox.identity.organization.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.cloudinary.Cloudinary;
import com.cloudinary.Uploader;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.ticketbox.identity.application.error.AppException;
import org.ticketbox.identity.application.error.ErrorCode;
import org.ticketbox.identity.config.CloudinaryProperties;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;

@ExtendWith(MockitoExtension.class)
class CloudinaryOrganizationImageStorageTest {
    @Mock private Cloudinary cloudinary;
    @Mock private Uploader uploader;

    private CloudinaryOrganizationImageStorage storage(String cloud) {
        return new CloudinaryOrganizationImageStorage(cloudinary,
                new CloudinaryProperties(cloud, "key", "secret", "ticketbox/organization-logos"));
    }

    @Test
    void uploadReturnsUrlAndPublicId() throws IOException {
        when(cloudinary.uploader()).thenReturn(uploader);
        when(uploader.upload(any(byte[].class), anyMap())).thenReturn(Map.of(
                "secure_url", "https://res.cloudinary.com/demo/logo.png", "public_id", "ticketbox/organization-logos/x"));
        var stored = storage("demo").uploadLogo(UUID.randomUUID(), new byte[] {1});
        assertThat(stored.secureUrl()).isEqualTo("https://res.cloudinary.com/demo/logo.png");
        assertThat(stored.publicId()).isEqualTo("ticketbox/organization-logos/x");
    }

    @Test
    void notConfiguredReturnsUnavailableWithoutCallingCloudinary() {
        var error = assertThrows(AppException.class, () -> storage("").uploadLogo(UUID.randomUUID(), new byte[] {1}));
        assertThat(error.getErrorCode()).isEqualTo(ErrorCode.IMAGE_STORAGE_UNAVAILABLE);
        verify(cloudinary, never()).uploader();
    }

    @Test
    void uploadFailureIsReportedAndDeleteFailureDoesNotEscape() throws IOException {
        when(cloudinary.uploader()).thenReturn(uploader);
        when(uploader.upload(any(byte[].class), anyMap())).thenThrow(new IOException("network"));
        var error = assertThrows(AppException.class, () -> storage("demo").uploadLogo(UUID.randomUUID(), new byte[] {1}));
        assertThat(error.getErrorCode()).isEqualTo(ErrorCode.IMAGE_STORAGE_UNAVAILABLE);
        when(uploader.destroy(any(String.class), anyMap())).thenThrow(new IOException("network"));
        assertDoesNotThrow(() -> storage("demo").deleteBestEffort("ticketbox/organization-logos/x"));
    }
}
