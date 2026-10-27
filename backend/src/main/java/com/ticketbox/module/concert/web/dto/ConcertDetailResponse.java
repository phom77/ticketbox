package com.ticketbox.module.concert.web.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record ConcertDetailResponse(
        UUID id,
        String title,
        String description,
        String artistBio,
        String venueName,
        String venueAddress,
        OffsetDateTime eventDate,
        OffsetDateTime doorsOpenAt,
        OffsetDateTime saleStartAt,
        OffsetDateTime saleEndAt,
        String status,
        String seatMapSvg,
        String posterUrl,
        UUID createdBy,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        List<TicketTypeResponse> ticketTypes
) {
    public ConcertDetailResponse(
            UUID id,
            String title,
            String description,
            String artistBio,
            String venueName,
            String venueAddress,
            OffsetDateTime eventDate,
            OffsetDateTime doorsOpenAt,
            OffsetDateTime saleStartAt,
            OffsetDateTime saleEndAt,
            String status,
            String seatMapSvg,
            String posterUrl,
            UUID createdBy,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt
    ) {
        this(id, title, description, artistBio, venueName, venueAddress, eventDate,
                doorsOpenAt, saleStartAt, saleEndAt, status, seatMapSvg, posterUrl,
                createdBy, createdAt, updatedAt, List.of());
    }

    public ConcertDetailResponse withTicketTypes(List<TicketTypeResponse> ticketTypes) {
        return new ConcertDetailResponse(
                id, title, description, artistBio, venueName, venueAddress,
                eventDate, doorsOpenAt, saleStartAt, saleEndAt, status,
                seatMapSvg, posterUrl, createdBy, createdAt, updatedAt, ticketTypes
        );
    }
}
