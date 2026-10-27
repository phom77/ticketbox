package com.ticketbox.module.admin.infrastructure.batch;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Locale;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

@Component
public class GuestListFileStorage {

    private final GuestListImportProperties properties;
    private Path root;

    public GuestListFileStorage(GuestListImportProperties properties) {
        this.properties = properties;
    }

    @PostConstruct
    void initialize() throws IOException {
        root = Path.of(properties.getRootDir()).toAbsolutePath().normalize();
        Files.createDirectories(incomingRoot());
        Files.createDirectories(processingRoot());
        Files.createDirectories(archiveSuccessRoot());
        Files.createDirectories(archivePartialRoot());
        Files.createDirectories(errorRoot());
    }

    public Path incomingRoot() {
        return root.resolve("incoming");
    }

    public Path storeUpload(UUID concertId, MultipartFile file) throws IOException {
        Path targetDirectory = safeConcertDirectory(processingRoot(), concertId);
        Files.createDirectories(targetDirectory);
        Path target = targetDirectory.resolve(UUID.randomUUID() + ".csv");
        try (InputStream input = file.getInputStream()) {
            Files.copy(input, target, StandardCopyOption.REPLACE_EXISTING);
        }
        return target;
    }

    public Path storeScheduledUpload(UUID concertId, MultipartFile file) throws IOException {
        Path targetDirectory = safeConcertDirectory(incomingRoot(), concertId);
        Files.createDirectories(targetDirectory);
        String safeName = sanitizeFileName(file.getOriginalFilename());
        String token = UUID.randomUUID().toString();
        Path temporary = targetDirectory.resolve(token + ".uploading");
        Path target = targetDirectory.resolve(token + "-" + safeName);
        try (InputStream input = file.getInputStream()) {
            Files.copy(input, temporary, StandardCopyOption.REPLACE_EXISTING);
        }
        try {
            return atomicMove(temporary, target);
        } catch (IOException ex) {
            Files.deleteIfExists(temporary);
            throw ex;
        }
    }

    public Path claimScheduledFile(UUID concertId, Path source) throws IOException {
        Path safeSource = requireUnder(incomingRoot(), source);
        Path targetDirectory = safeConcertDirectory(processingRoot(), concertId);
        Files.createDirectories(targetDirectory);
        String safeName = sanitizeFileName(safeSource.getFileName().toString());
        Path target = targetDirectory.resolve(UUID.randomUUID() + "-" + safeName);
        return atomicMove(safeSource, target);
    }

    public Path archive(Path source, UUID concertId, boolean partial) throws IOException {
        return moveToFinalDirectory(
                source,
                partial ? archivePartialRoot() : archiveSuccessRoot(),
                concertId);
    }

    public Path quarantine(Path source, UUID concertId) throws IOException {
        return moveToFinalDirectory(source, errorRoot(), concertId);
    }

    public void deleteQuietly(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (IOException ignored) {
            // Operational cleanup can remove a stale upload later.
        }
    }

    public boolean isStableCsv(Path path, Instant now) {
        try {
            return Files.isRegularFile(path)
                    && path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".csv")
                    && !Files.getLastModifiedTime(path).toInstant()
                            .plus(properties.getStableAge()).isAfter(now);
        } catch (IOException ex) {
            return false;
        }
    }

    public long size(Path path) throws IOException {
        return Files.size(path);
    }

    public String checksum(Path path) throws IOException {
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

    public Path errorReportPath(UUID concertId, UUID batchLogId, boolean failed)
            throws IOException {
        Path directory = safeConcertDirectory(
                failed ? errorRoot() : archivePartialRoot(),
                concertId);
        Files.createDirectories(directory);
        return directory.resolve(batchLogId + "-errors.csv");
    }

    private Path moveToFinalDirectory(Path source, Path destinationRoot, UUID concertId)
            throws IOException {
        Path safeSource = requireUnder(processingRoot(), source);
        Path destinationDirectory = safeConcertDirectory(destinationRoot, concertId);
        Files.createDirectories(destinationDirectory);
        return atomicMove(
                safeSource,
                destinationDirectory.resolve(safeSource.getFileName().toString()));
    }

    private Path atomicMove(Path source, Path target) throws IOException {
        try {
            return Files.move(source, target, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException ex) {
            return Files.move(source, target);
        }
    }

    private Path safeConcertDirectory(Path parent, UUID concertId) {
        return requireUnder(parent, parent.resolve(concertId.toString()));
    }

    private Path requireUnder(Path parent, Path path) {
        Path normalizedParent = parent.toAbsolutePath().normalize();
        Path normalizedPath = path.toAbsolutePath().normalize();
        if (!normalizedPath.startsWith(normalizedParent)) {
            throw new IllegalArgumentException("Path escapes guest-list storage");
        }
        return normalizedPath;
    }

    private String sanitizeFileName(String fileName) {
        if (fileName == null || fileName.isBlank()) {
            return "guest-list.csv";
        }
        String sanitized = fileName.replaceAll("[^A-Za-z0-9._-]", "_");
        return sanitized.isBlank() ? "guest-list.csv" : sanitized;
    }

    private Path processingRoot() {
        return root.resolve("processing");
    }

    private Path archiveSuccessRoot() {
        return root.resolve("archive").resolve("success");
    }

    private Path archivePartialRoot() {
        return root.resolve("archive").resolve("partial");
    }

    private Path errorRoot() {
        return root.resolve("error");
    }
}
