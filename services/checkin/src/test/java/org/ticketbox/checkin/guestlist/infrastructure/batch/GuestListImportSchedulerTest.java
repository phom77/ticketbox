package org.ticketbox.checkin.guestlist.infrastructure.batch;

import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.ticketbox.checkin.guestlist.application.GuestListImportService;

@ExtendWith(MockitoExtension.class)
class GuestListImportSchedulerTest {

    @Mock private GuestListImportService importService;
    @Mock private GuestListFileStorage fileStorage;

    @Test
    void importAvailableFiles_DelegatesToService() {
        GuestListImportScheduler scheduler =
                new GuestListImportScheduler(fileStorage, importService);
        scheduler.importAvailableFiles();

        verify(importService).importAvailableFiles();
    }
}
