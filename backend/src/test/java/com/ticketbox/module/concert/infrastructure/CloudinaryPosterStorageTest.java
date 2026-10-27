package com.ticketbox.module.concert.infrastructure;

import com.cloudinary.Cloudinary;
import com.cloudinary.Uploader;
import com.ticketbox.module.concert.application.port.PosterStorage.StoredPoster;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.util.unit.DataSize;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CloudinaryPosterStorageTest {

    @Mock
    private Cloudinary cloudinary;

    @Mock
    private Uploader uploader;

    private CloudinaryPosterStorage storage;

    @BeforeEach
    void setUp() {
        CloudinaryProperties properties = new CloudinaryProperties(
                "demo-cloud", "api-key", "api-secret", "ticketbox/concert-posters", DataSize.ofMegabytes(5));
        storage = new CloudinaryPosterStorage(cloudinary, properties);
    }

    @Test
    void upload_ValidJpeg_ReturnsSecureUrlAndPublicId() throws IOException {
        byte[] jpeg = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 0x01};
        MockMultipartFile file = new MockMultipartFile("file", "poster.jpg", "image/jpeg", jpeg);
        when(cloudinary.uploader()).thenReturn(uploader);
        when(uploader.upload(any(byte[].class), anyMap())).thenReturn(Map.of(
                "secure_url", "https://res.cloudinary.com/demo/poster.jpg",
                "public_id", "ticketbox/concert-posters/poster"
        ));

        StoredPoster result = storage.upload(UUID.randomUUID(), file);

        assertEquals("https://res.cloudinary.com/demo/poster.jpg", result.secureUrl());
        assertEquals("ticketbox/concert-posters/poster", result.publicId());
    }

    @Test
    void upload_SpoofedContentType_IsRejectedBeforeCloudinary() {
        MockMultipartFile file = new MockMultipartFile(
                "file", "poster.jpg", "image/jpeg", "not-an-image".getBytes());

        AppException exception = assertThrows(AppException.class, () -> storage.upload(UUID.randomUUID(), file));

        assertEquals(ErrorCode.INVALID_REQUEST, exception.getErrorCode());
    }

    @Test
    void upload_UnsupportedType_IsRejected() {
        MockMultipartFile file = new MockMultipartFile("file", "poster.gif", "image/gif", "GIF89a".getBytes());

        AppException exception = assertThrows(AppException.class, () -> storage.upload(UUID.randomUUID(), file));

        assertEquals(ErrorCode.INVALID_REQUEST, exception.getErrorCode());
    }

    @Test
    void upload_FileOverFiveMegabytes_IsRejected() {
        byte[] oversized = new byte[(5 * 1024 * 1024) + 1];
        oversized[0] = (byte) 0xFF;
        oversized[1] = (byte) 0xD8;
        oversized[2] = (byte) 0xFF;
        MockMultipartFile file = new MockMultipartFile("file", "poster.jpg", "image/jpeg", oversized);

        AppException exception = assertThrows(AppException.class, () -> storage.upload(UUID.randomUUID(), file));

        assertEquals(ErrorCode.INVALID_REQUEST, exception.getErrorCode());
    }

    @Test
    void deleteBestEffort_CloudinaryFailureDoesNotEscape() throws IOException {
        when(cloudinary.uploader()).thenReturn(uploader);
        when(uploader.destroy(any(String.class), anyMap())).thenThrow(new IOException("network error"));

        assertDoesNotThrow(() -> storage.deleteBestEffort("ticketbox/concert-posters/poster"));
        verify(uploader).destroy(any(String.class), anyMap());
    }
}
