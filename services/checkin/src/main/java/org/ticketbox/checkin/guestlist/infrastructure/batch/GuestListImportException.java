package org.ticketbox.checkin.guestlist.infrastructure.batch;

public class GuestListImportException extends RuntimeException {

    public GuestListImportException(String message) {
        super(message);
    }

    public GuestListImportException(String message, Throwable cause) {
        super(message, cause);
    }
}
