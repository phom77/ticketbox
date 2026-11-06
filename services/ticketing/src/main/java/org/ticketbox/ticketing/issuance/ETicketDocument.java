package org.ticketbox.ticketing.issuance;

public record ETicketDocument(String filename, String contentType, byte[] content) {
}
