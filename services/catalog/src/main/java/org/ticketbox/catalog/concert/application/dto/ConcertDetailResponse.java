package org.ticketbox.catalog.concert.application.dto;

import org.ticketbox.catalog.sales.application.dto.TicketTypeResponse;
import org.ticketbox.catalog.concert.domain.ConcertText;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
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
        List<TicketTypeResponse> ticketTypes,
        @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
        String organizationName,
        ConcertText original,
        Map<String, ConcertText> translations) {
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
            OffsetDateTime updatedAt) {
        this(
                id,
                title,
                description,
                artistBio,
                venueName,
                venueAddress,
                eventDate,
                doorsOpenAt,
                saleStartAt,
                saleEndAt,
                status,
                seatMapSvg,
                posterUrl,
                createdBy,
                createdAt,
                updatedAt,
                List.of(), null, new ConcertText(title, description), Map.of());
    }

    public ConcertDetailResponse withTicketTypes(List<TicketTypeResponse> ticketTypes) {
        return new ConcertDetailResponse(
                id,
                title,
                description,
                artistBio,
                venueName,
                venueAddress,
                eventDate,
                doorsOpenAt,
                saleStartAt,
                saleEndAt,
                status,
                seatMapSvg,
                posterUrl,
                createdBy,
                createdAt,
                updatedAt,
                ticketTypes, organizationName, original, translations);
    }

    public ConcertDetailResponse withOrganizationName(String organizationName) {
        return new ConcertDetailResponse(id, title, description, artistBio, venueName, venueAddress,
                eventDate, doorsOpenAt, saleStartAt, saleEndAt, status, seatMapSvg, posterUrl,
                createdBy, createdAt, updatedAt, ticketTypes, organizationName, original, translations);
    }
}
