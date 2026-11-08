package org.ticketbox.catalog.artistbio.infrastructure;

import jakarta.annotation.PostConstruct;

import org.springframework.stereotype.Component;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.application.error.ErrorCode;
import org.ticketbox.catalog.application.port.Upload;
import org.ticketbox.catalog.artistbio.application.port.StoredArtistPdf;
import org.ticketbox.catalog.config.AiProperties;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Component
public class ArtistPdfFileStorage
        implements org.ticketbox.catalog.artistbio.application.port.ArtistDocuments {

    private static final Set<String> ALLOWED_CONTENT_TYPES =
            Set.of("application/pdf", "application/octet-stream");

    private final AiProperties properties;
    private Path root;

    public ArtistPdfFileStorage(AiProperties properties) {
        this.properties = properties;
    }

    @PostConstruct
    void initialize() throws IOException {
        root = Path.of(properties.getStorageRoot()).toAbsolutePath().normalize();
        Files.createDirectories(root);
    }

    public StoredArtistPdf store(UUID concertId, Upload file) {
        validateMetadata(file);
        Path stored = null;
        try {
            Path directory = requireUnderRoot(root.resolve(concertId.toString()));
            Files.createDirectories(directory);
            stored = directory.resolve(UUID.randomUUID() + ".pdf");
            try (InputStream input = file.getInputStream()) {
                Files.copy(input, stored, StandardCopyOption.REPLACE_EXISTING);
            }
            requirePdfMagic(stored);
            return new StoredArtistPdf(
                    stored, safeOriginalName(file.getOriginalFilename()), checksum(stored));
        } catch (AppException ex) {
            deleteQuietly(stored);
            throw ex;
        } catch (IOException ex) {
            deleteQuietly(stored);
            throw new AppException(
                    ErrorCode.INTERNAL_SERVER_ERROR, "error.artist-bio.pdf-save-failed");
        }
    }

    public Path requireStoredPath(String value) {
        return requireUnderRoot(Path.of(value));
    }

    public void deleteQuietly(Path path) {
        if (path == null) {
            return;
        }
        try {
            Files.deleteIfExists(path);
        } catch (IOException ignored) {
            // Retained files can be cleaned operationally.
        }
    }

    private void validateMetadata(Upload file) {
        if (file == null || file.isEmpty()) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.artist-bio.pdf-required");
        }
        String name = file.getOriginalFilename();
        if (name == null || !name.toLowerCase(Locale.ROOT).endsWith(".pdf")) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.artist-bio.pdf-extension");
        }
        String contentType = file.getContentType();
        if (contentType != null
                && !contentType.isBlank()
                && !ALLOWED_CONTENT_TYPES.contains(contentType.toLowerCase(Locale.ROOT))) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.artist-bio.pdf-content-type");
        }
        if (file.getSize() > properties.getMaxFileSize().toBytes()) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.artist-bio.pdf-too-large");
        }
    }

    private void requirePdfMagic(Path path) throws IOException {
        byte[] magic = new byte[5];
        try (InputStream input = Files.newInputStream(path)) {
            if (input.read(magic) != magic.length
                    || !"%PDF-"
                            .equals(
                                    new String(
                                            magic, java.nio.charset.StandardCharsets.US_ASCII))) {
                throw new AppException(ErrorCode.INVALID_REQUEST, "error.artist-bio.pdf-invalid");
            }
        }
    }

    private String checksum(Path path) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream input = Files.newInputStream(path);
                    DigestInputStream digestInput = new DigestInputStream(input, digest)) {
                digestInput.transferTo(java.io.OutputStream.nullOutputStream());
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is not available", ex);
        }
    }

    private Path requireUnderRoot(Path path) {
        Path normalized = path.toAbsolutePath().normalize();
        if (!normalized.startsWith(root)) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.artist-bio.pdf-path-invalid");
        }
        return normalized;
    }

    private String safeOriginalName(String name) {
        String normalized = name == null ? "" : name.replace('\\', '/');
        String fileName = normalized.substring(normalized.lastIndexOf('/') + 1);
        String sanitized = fileName.replaceAll("[^A-Za-z0-9._-]", "_");
        return sanitized.isBlank() ? "artist-profile.pdf" : sanitized;
    }
}
