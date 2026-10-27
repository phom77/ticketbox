package com.ticketbox.module.admin.infrastructure.batch;

import com.ticketbox.module.admin.domain.BatchLog;
import com.ticketbox.module.admin.domain.BatchLogRepository;
import com.ticketbox.module.concert.ConcertReportingPort;
import com.ticketbox.shared.util.PhoneNormalizer;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.PushbackInputStream;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVPrinter;
import org.apache.commons.csv.CSVRecord;
import org.apache.commons.csv.DuplicateHeaderMode;
import org.springframework.batch.core.StepContribution;
import org.springframework.batch.core.scope.context.ChunkContext;
import org.springframework.batch.core.step.tasklet.Tasklet;
import org.springframework.batch.repeat.RepeatStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class GuestListImportTasklet implements Tasklet {

    private static final int WRITE_CHUNK_SIZE = 500;

    private final JdbcTemplate jdbcTemplate;
    private final BatchLogRepository batchLogRepository;
    private final PhoneNormalizer phoneNormalizer;
    private final ConcertReportingPort concertReportingPort;
    private final GuestListFileStorage fileStorage;

    public GuestListImportTasklet(
            JdbcTemplate jdbcTemplate,
            BatchLogRepository batchLogRepository,
            PhoneNormalizer phoneNormalizer,
            ConcertReportingPort concertReportingPort,
            GuestListFileStorage fileStorage) {
        this.jdbcTemplate = jdbcTemplate;
        this.batchLogRepository = batchLogRepository;
        this.phoneNormalizer = phoneNormalizer;
        this.concertReportingPort = concertReportingPort;
        this.fileStorage = fileStorage;
    }

    @Override
    public RepeatStatus execute(StepContribution contribution, ChunkContext chunkContext)
            throws Exception {
        var parameters = chunkContext.getStepContext().getJobParameters();
        UUID concertId = UUID.fromString((String) parameters.get("concertId"));
        UUID batchLogId = UUID.fromString((String) parameters.get("batchLogId"));
        Path filePath = Path.of((String) parameters.get("filePath")).toAbsolutePath().normalize();
        String sourceFileName = (String) parameters.get("fileName");

        if (concertReportingPort.findConcert(concertId).isEmpty()) {
            throw new GuestListImportException("Concert does not exist");
        }

        BatchLog batchLog = batchLogRepository.findById(batchLogId)
                .orElseThrow(() -> new GuestListImportException("Batch log does not exist"));

        int totalRows;
        try {
            totalRows = stageFile(batchLogId, concertId, filePath);
        } catch (GuestListImportException exception) {
            Path errorReport = writeStructuralErrorReport(batchLogId, concertId, exception.getMessage());
            batchLog.setStatus(BatchLog.Status.FAILED);
            batchLog.setErrorDetail(exception.getMessage());
            batchLog.setErrorReportPath(errorReport.toString());
            batchLogRepository.save(batchLog);
            throw exception;
        }
        if (totalRows == 0) {
            throw new GuestListImportException("CSV contains no data rows");
        }

        markDuplicatePhones(batchLogId);
        int validRows = countRows(batchLogId, true);
        int errorRows = totalRows - validRows;

        if (validRows == 0) {
            Path errorReport = writeErrorReport(batchLogId, concertId, true);
            batchLog.setTotalRows(totalRows);
            batchLog.setSuccessRows(0);
            batchLog.setErrorRows(errorRows);
            batchLog.setStatus(BatchLog.Status.FAILED);
            batchLog.setErrorDetail("CSV contains no valid rows");
            batchLog.setErrorReportPath(errorReport.toString());
            jdbcTemplate.update("DELETE FROM guest_list_staging WHERE batch_log_id = ?", batchLogId);
            batchLogRepository.save(batchLog);
            return RepeatStatus.FINISHED;
        }

        mergeValidRows(batchLogId, sourceFileName);
        Path errorReport = errorRows > 0
                ? writeErrorReport(batchLogId, concertId, false)
                : null;
        jdbcTemplate.update("DELETE FROM guest_list_staging WHERE batch_log_id = ?", batchLogId);

        batchLog.setTotalRows(totalRows);
        batchLog.setSuccessRows(validRows);
        batchLog.setErrorRows(errorRows);
        batchLog.setStatus(errorRows == 0 ? BatchLog.Status.SUCCESS : BatchLog.Status.PARTIAL);
        batchLog.setErrorDetail(errorRows == 0 ? null : errorRows + " row(s) were rejected");
        if (errorReport != null) {
            batchLog.setErrorReportPath(errorReport.toString());
        }
        batchLogRepository.save(batchLog);
        return RepeatStatus.FINISHED;
    }

    private int stageFile(UUID batchLogId, UUID concertId, Path filePath) throws IOException {
        CSVFormat format = CSVFormat.DEFAULT.builder()
                .setHeader()
                .setSkipHeaderRecord(true)
                .setIgnoreHeaderCase(true)
                .setAllowMissingColumnNames(false)
                .setDuplicateHeaderMode(DuplicateHeaderMode.DISALLOW)
                .build();

        int totalRows = 0;
        List<StagedRow> pending = new ArrayList<>(WRITE_CHUNK_SIZE);
        try (Reader reader = bomAwareReader(filePath);
                CSVParser parser = format.parse(reader)) {
            validateHeaders(parser);
            for (CSVRecord record : parser) {
                int rowNumber = Math.toIntExact(record.getRecordNumber() + 1);
                pending.add(validateRow(record, rowNumber, concertId));
                totalRows++;
                if (pending.size() == WRITE_CHUNK_SIZE) {
                    insertRows(batchLogId, pending);
                    pending.clear();
                }
            }
            if (!pending.isEmpty()) {
                insertRows(batchLogId, pending);
            }
        } catch (IllegalArgumentException ex) {
            throw new GuestListImportException("CSV không đúng định dạng: " + ex.getMessage(), ex);
        }
        return totalRows;
    }

    private void validateHeaders(CSVParser parser) {
        Set<String> missing = GuestListCsvSchema.missingRequiredHeaders(parser.getHeaderMap().keySet());
        if (!missing.isEmpty()) {
            throw new GuestListImportException("Thiếu cột bắt buộc trong CSV: " + missing);
        }
    }

    private StagedRow validateRow(CSVRecord record, int rowNumber, UUID concertId) {
        String rawPhone = GuestListCsvSchema.value(record, "phone");
        String phone = phoneNormalizer.normalize(rawPhone);
        String fullName = nullableTrim(GuestListCsvSchema.value(record, "full_name"));
        String category = nullableTrim(GuestListCsvSchema.value(record, "category"));
        String sponsorName = nullableTrim(GuestListCsvSchema.value(record, "sponsor_name"));
        String notes = nullableTrim(GuestListCsvSchema.value(record, "notes"));
        String status = nullableTrim(GuestListCsvSchema.value(record, "status"));

        List<String> errors = new ArrayList<>();
        if (phone == null) {
            errors.add("Số điện thoại không hợp lệ");
        }
        if (fullName == null) {
            errors.add("full_name là bắt buộc");
        } else if (fullName.length() > 255) {
            errors.add("full_name vượt quá 255 ký tự");
        }
        if (category != null && category.length() > 100) {
            errors.add("category vượt quá 100 ký tự");
        }
        if (sponsorName != null && sponsorName.length() > 255) {
            errors.add("sponsor_name vượt quá 255 ký tự");
        }
        Boolean active = activeStatus(status);
        if (active == null) {
            errors.add("status phải là ACTIVE hoặc CANCELLED");
            active = true;
        }

        return new StagedRow(
                rowNumber,
                concertId,
                phone,
                truncate(fullName, 255),
                truncate(category, 100),
                truncate(sponsorName, 255),
                notes,
                active,
                errors.isEmpty() ? null : String.join("; ", errors));
    }

    private void insertRows(UUID batchLogId, List<StagedRow> rows) {
        jdbcTemplate.batchUpdate(
                """
                INSERT INTO guest_list_staging (
                    batch_log_id, row_number, concert_id, normalized_phone,
                    full_name, category, sponsor_name, notes, is_active, validation_error
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                rows,
                rows.size(),
                (statement, row) -> {
                    statement.setObject(1, batchLogId);
                    statement.setInt(2, row.rowNumber());
                    statement.setObject(3, row.concertId());
                    statement.setString(4, row.phone());
                    statement.setString(5, row.fullName());
                    statement.setString(6, row.category());
                    statement.setString(7, row.sponsorName());
                    statement.setString(8, row.notes());
                    statement.setBoolean(9, row.active());
                    statement.setString(10, row.validationError());
                });
    }

    private void markDuplicatePhones(UUID batchLogId) {
        jdbcTemplate.update(
                """
                UPDATE guest_list_staging s
                SET validation_error =
                    CASE
                        WHEN validation_error IS NULL THEN 'Duplicate phone in file'
                        ELSE validation_error || '; Duplicate phone in file'
                    END
                WHERE s.batch_log_id = ?
                  AND s.normalized_phone IS NOT NULL
                  AND s.normalized_phone IN (
                      SELECT normalized_phone
                      FROM guest_list_staging
                      WHERE batch_log_id = ?
                        AND normalized_phone IS NOT NULL
                      GROUP BY normalized_phone
                      HAVING COUNT(*) > 1
                  )
                """,
                batchLogId,
                batchLogId);
    }

    private int countRows(UUID batchLogId, boolean validOnly) {
        String sql = validOnly
                ? "SELECT COUNT(*) FROM guest_list_staging WHERE batch_log_id = ? AND validation_error IS NULL"
                : "SELECT COUNT(*) FROM guest_list_staging WHERE batch_log_id = ?";
        Integer count = jdbcTemplate.queryForObject(sql, Integer.class, batchLogId);
        return count == null ? 0 : count;
    }

    private void mergeValidRows(UUID batchLogId, String sourceFileName) {
        jdbcTemplate.update(
                """
                INSERT INTO guest_lists (
                    concert_id, phone, full_name, category, sponsor_name,
                    notes, is_active, imported_at, batch_file
                )
                SELECT concert_id, normalized_phone, full_name, category, sponsor_name,
                    notes, is_active, ?, ?
                FROM guest_list_staging
                WHERE batch_log_id = ? AND validation_error IS NULL
                ON CONFLICT (concert_id, phone) DO UPDATE SET
                    full_name = EXCLUDED.full_name,
                    category = EXCLUDED.category,
                    sponsor_name = EXCLUDED.sponsor_name,
                    notes = EXCLUDED.notes,
                    is_active = EXCLUDED.is_active,
                    imported_at = EXCLUDED.imported_at,
                    batch_file = EXCLUDED.batch_file,
                    updated_at = NOW()
                """,
                OffsetDateTime.now(),
                sourceFileName,
                batchLogId);
    }

    private Path writeErrorReport(UUID batchLogId, UUID concertId, boolean failed)
            throws IOException {
        Path reportPath = fileStorage.errorReportPath(concertId, batchLogId, failed);
        try (BufferedWriter writer = Files.newBufferedWriter(reportPath, StandardCharsets.UTF_8);
                CSVPrinter printer = new CSVPrinter(
                        writer,
                        CSVFormat.DEFAULT.builder()
                                .setHeader("row_number", "phone", "error")
                                .build())) {
            List<Map<String, Object>> errors = jdbcTemplate.queryForList(
                    """
                    SELECT row_number, normalized_phone, validation_error
                    FROM guest_list_staging
                    WHERE batch_log_id = ? AND validation_error IS NOT NULL
                    ORDER BY row_number
                    """,
                    batchLogId);
            for (Map<String, Object> error : errors) {
                printer.printRecord(
                        error.get("row_number"),
                        error.get("normalized_phone"),
                        error.get("validation_error"));
            }
        }
        return reportPath;
    }

    private Path writeStructuralErrorReport(UUID batchLogId, UUID concertId, String error)
            throws IOException {
        Path reportPath = fileStorage.errorReportPath(concertId, batchLogId, true);
        try (BufferedWriter writer = Files.newBufferedWriter(reportPath, StandardCharsets.UTF_8);
                CSVPrinter printer = new CSVPrinter(writer, CSVFormat.DEFAULT.builder()
                        .setHeader("row_number", "phone", "error")
                        .build())) {
            printer.printRecord(0, "", error);
        }
        return reportPath;
    }

    private Reader bomAwareReader(Path path) throws IOException {
        InputStream input = Files.newInputStream(path);
        PushbackInputStream pushback = new PushbackInputStream(input, 3);
        byte[] bom = pushback.readNBytes(3);
        if (!(bom.length == 3
                && (bom[0] & 0xFF) == 0xEF
                && (bom[1] & 0xFF) == 0xBB
                && (bom[2] & 0xFF) == 0xBF)) {
            pushback.unread(bom);
        }
        return new InputStreamReader(pushback, StandardCharsets.UTF_8);
    }

    private String nullableTrim(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String truncate(String value, int maxLength) {
        return value == null || value.length() <= maxLength ? value : value.substring(0, maxLength);
    }

    private Boolean activeStatus(String status) {
        if (status == null || status.equalsIgnoreCase("ACTIVE")) {
            return true;
        }
        if (status.equalsIgnoreCase("CANCELLED")
                || status.equalsIgnoreCase("CANCELED")
                || status.equalsIgnoreCase("INACTIVE")
                || status.equalsIgnoreCase("DISABLED")) {
            return false;
        }
        return null;
    }

    private record StagedRow(
            int rowNumber,
            UUID concertId,
            String phone,
            String fullName,
            String category,
            String sponsorName,
            String notes,
            boolean active,
            String validationError) {}
}
