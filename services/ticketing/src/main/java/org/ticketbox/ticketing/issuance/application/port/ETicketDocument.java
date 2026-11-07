package org.ticketbox.ticketing.issuance.application.port;

public record ETicketDocument(String filename, String contentType, byte[] content) {}
