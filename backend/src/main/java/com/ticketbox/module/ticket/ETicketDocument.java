package com.ticketbox.module.ticket;

public record ETicketDocument(String filename, String contentType, byte[] content) {
}
