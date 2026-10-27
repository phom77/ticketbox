package com.ticketbox.module.admin.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ticketbox.module.admin.domain.BatchLog;
import com.ticketbox.module.admin.domain.BatchLogRepository;
import com.ticketbox.module.admin.infrastructure.batch.GuestListFileStorage;
import com.ticketbox.module.admin.infrastructure.batch.GuestListImportProperties;
import com.ticketbox.module.admin.infrastructure.batch.GuestListJobRunner;
import com.ticketbox.shared.exception.AppException;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

@ExtendWith(MockitoExtension.class)
class GuestListImportServiceTest {

    @Mock private BatchLogRepository batchLogRepository;
    @Mock private GuestListFileStorage fileStorage;
    @Mock private GuestListJobRunner jobRunner;
    @Mock private GuestListAccessService accessService;

    private GuestListImportService service;

    @BeforeEach
    void setUp() {
        service = new GuestListImportService(
                batchLogRepository,
                fileStorage,
                new GuestListImportProperties(),
                jobRunner,
                accessService);
    }

    @Test
    void queueScheduledUpload_CreatesPendingLogWithoutLaunchingJob() throws Exception {
        UUID concertId = UUID.randomUUID();
        UUID organizerId = UUID.randomUUID();
        Path incoming = Path.of("incoming", concertId.toString(), "queued-guests.csv");
        MockMultipartFile file = csv();

        when(fileStorage.storeScheduledUpload(concertId, file)).thenReturn(incoming);
        when(fileStorage.checksum(incoming)).thenReturn("checksum");
        when(batchLogRepository
                .findFirstByConcertIdAndChecksumAndStatusInOrderByCompletedAtDesc(
                        any(), any(), any()))
                .thenReturn(Optional.empty());
        when(batchLogRepository.saveAndFlush(any(BatchLog.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        BatchLog result = service.queueScheduledUpload(concertId, file, organizerId);

        assertThat(result.getStatus()).isEqualTo(BatchLog.Status.PENDING);
        assertThat(result.getSource()).isEqualTo(BatchLog.Source.SCHEDULED);
        assertThat(result.getFileName()).isEqualTo("guests.csv");
        assertThat(result.getFilePath()).isEqualTo(incoming.toString());
        verify(accessService).requireAccess(concertId, organizerId, false);
        verify(jobRunner, never()).launch(any());
    }

    @Test
    void submitScheduled_ClaimsPendingLogAndLaunchesSameBatch() throws Exception {
        UUID concertId = UUID.randomUUID();
        Path queued = Path.of("incoming", concertId.toString(), "queued-guests.csv");
        Path claimed = Path.of("processing", concertId.toString(), "queued-guests.csv");
        BatchLog pending = pending(concertId, queued, "checksum");

        when(fileStorage.size(claimed)).thenReturn(128L);
        when(fileStorage.checksum(claimed)).thenReturn("checksum");
        when(batchLogRepository.findFirstByConcertIdAndChecksumAndStatusOrderByStartedAtDesc(
                concertId, "checksum", BatchLog.Status.PENDING))
                .thenReturn(Optional.of(pending));
        when(batchLogRepository.saveAndFlush(pending)).thenReturn(pending);

        BatchLog result = service.submitScheduled(
                concertId,
                claimed,
                "queued-guests.csv",
                queued);

        assertThat(result).isSameAs(pending);
        assertThat(result.getStatus()).isEqualTo(BatchLog.Status.RUNNING);
        assertThat(result.getFilePath()).isEqualTo(claimed.toString());
        assertThat(result.getFileName()).isEqualTo("guests.csv");
        verify(jobRunner).launch(pending);
    }

    @Test
    void queueScheduledUpload_DuplicateIsSkippedAndQueuedFileIsDeleted() throws Exception {
        UUID concertId = UUID.randomUUID();
        Path incoming = Path.of("incoming", concertId.toString(), "duplicate.csv");
        BatchLog existing = pending(concertId, incoming, "checksum");
        existing.setStatus(BatchLog.Status.SUCCESS);
        MockMultipartFile file = csv();

        when(fileStorage.storeScheduledUpload(concertId, file)).thenReturn(incoming);
        when(fileStorage.checksum(incoming)).thenReturn("checksum");
        when(batchLogRepository
                .findFirstByConcertIdAndChecksumAndStatusInOrderByCompletedAtDesc(
                        any(), any(), any()))
                .thenReturn(Optional.of(existing));
        when(batchLogRepository.save(any(BatchLog.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        BatchLog result = service.queueScheduledUpload(
                concertId,
                file,
                UUID.randomUUID());

        assertThat(result.getStatus()).isEqualTo(BatchLog.Status.SKIPPED);
        assertThat(result.getCompletedAt()).isNotNull();
        verify(fileStorage).deleteQuietly(incoming);
        verify(jobRunner, never()).launch(any());
    }

    @Test
    void queueScheduledUpload_StopsBeforeStorageWhenOrganizerDoesNotOwnConcert() throws Exception {
        UUID concertId = UUID.randomUUID();
        UUID organizerId = UUID.randomUUID();
        MockMultipartFile file = csv();
        AppException denied = new AppException(
                com.ticketbox.shared.exception.ErrorCode.RESOURCE_NOT_FOUND,
                "Concert not found");
        org.mockito.Mockito.doThrow(denied)
                .when(accessService).requireAccess(concertId, organizerId, false);

        assertThatThrownBy(() -> service.queueScheduledUpload(concertId, file, organizerId))
                .isSameAs(denied);

        verify(fileStorage, never()).storeScheduledUpload(any(), any());
    }

    private MockMultipartFile csv() {
        return new MockMultipartFile(
                "file",
                "guests.csv",
                "text/csv",
                "phone,full_name,category,sponsor_name,notes\n0901234567,Guest,VIP,Sponsor,Note"
                        .getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }

    private BatchLog pending(UUID concertId, Path path, String checksum) {
        BatchLog log = new BatchLog();
        log.setJobName("GUEST_LIST_IMPORT");
        log.setConcertId(concertId);
        log.setSource(BatchLog.Source.SCHEDULED);
        log.setChecksum(checksum);
        log.setFileName("guests.csv");
        log.setFilePath(path.toString());
        log.setStartedAt(OffsetDateTime.now());
        log.setStatus(BatchLog.Status.PENDING);
        return log;
    }
}
