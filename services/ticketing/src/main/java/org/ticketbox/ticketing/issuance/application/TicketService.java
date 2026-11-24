package org.ticketbox.ticketing.issuance.application;

import org.ticketbox.ticketing.application.port.FallbackTicketNames;

import lombok.RequiredArgsConstructor;

import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.application.error.ErrorCode;
import org.ticketbox.ticketing.application.port.catalog.ConcertOrderPort;
import org.ticketbox.ticketing.application.port.catalog.ConcertView;
import org.ticketbox.ticketing.application.port.catalog.TicketTypeView;
import org.ticketbox.ticketing.issuance.application.dto.TicketResponse;
import org.ticketbox.ticketing.issuance.application.port.TicketRepository;
import org.ticketbox.ticketing.issuance.application.port.TicketPlaces;
import org.ticketbox.ticketing.issuance.application.port.TicketPlaces.Place;
import org.ticketbox.ticketing.issuance.domain.Ticket;

import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class TicketService {
    private final FallbackTicketNames fallbackNames;
    private final TicketRepository ticketRepository;
    private final ConcertOrderPort concertOrderPort;
    private final TicketPlaces places;

    public List<TicketResponse> listUserTickets(UUID userId) {
        List<Ticket> tickets = ticketRepository.findByUserIdOrderByIssuedAtDesc(userId);
        if (tickets.isEmpty()) {
            return Collections.emptyList();
        }

        Set<UUID> concertIds =
                tickets.stream().map(Ticket::getConcertId).collect(Collectors.toSet());
        Set<UUID> ticketTypeIds =
                tickets.stream().map(Ticket::getTicketTypeId).collect(Collectors.toSet());

        Map<UUID, String> concertMap =
                concertOrderPort.findConcertsByIds(concertIds).stream()
                        .collect(Collectors.toMap(ConcertView::id, ConcertView::title));
        Map<UUID, String> ticketTypeMap =
                concertOrderPort.findTicketTypesByIds(ticketTypeIds).stream()
                        .collect(Collectors.toMap(TicketTypeView::id, TicketTypeView::name));

        var schedule = places.forTickets(tickets.stream().map(Ticket::getId).toList());
        return tickets.stream().map(ticket -> toResponse(ticket,
                concertMap.getOrDefault(ticket.getConcertId(), fallbackNames.unknownConcert()),
                ticketTypeMap.getOrDefault(ticket.getTicketTypeId(), fallbackNames.unknownTicketType()),
                schedule.get(ticket.getId()))).toList();
    }

    public TicketResponse getTicketDetail(UUID ticketId, UUID userId) {
        Ticket t =
                ticketRepository
                        .findByIdAndUserId(ticketId, userId)
                        .orElseThrow(
                                () ->
                                        new AppException(
                                                ErrorCode.TICKET_NOT_FOUND,
                                                "error.ticket-not-found"));

        ConcertView concert =
                concertOrderPort
                        .findConcertById(t.getConcertId())
                        .orElseThrow(
                                () ->
                                        new AppException(
                                                ErrorCode.CONCERT_NOT_FOUND,
                                                "error.concert-not-found"));

        TicketTypeView ticketType =
                concertOrderPort.findTicketTypesByIds(List.of(t.getTicketTypeId())).stream()
                        .findFirst()
                        .orElseThrow(
                                () ->
                                        new AppException(
                                                ErrorCode.RESOURCE_NOT_FOUND,
                                                "error.ticket-type.not-found"));

        return toResponse(t, concert.title(), ticketType.name(), places.forTickets(List.of(t.getId())).get(t.getId()));
    }

    // ---- Admin / Organizer ----

    public List<TicketResponse> listConcertTickets(UUID concertId, String status) {
        return listConcertTickets(concertId, status, null, true);
    }

    public List<TicketResponse> listConcertTickets(
            UUID concertId, String status, UUID requesterId, boolean admin) {
        if (!admin) {
            requireOwnedConcert(concertId, requesterId);
        }

        List<Ticket> tickets;
        if (status != null) {
            tickets =
                    ticketRepository.findByConcertIdAndStatus(
                            concertId, Ticket.Status.valueOf(status));
        } else {
            tickets = ticketRepository.findByConcertId(concertId, Pageable.unpaged()).getContent();
        }

        if (tickets.isEmpty()) return Collections.emptyList();

        Set<UUID> ticketTypeIds =
                tickets.stream().map(Ticket::getTicketTypeId).collect(Collectors.toSet());
        Map<UUID, String> ticketTypeMap =
                concertOrderPort.findTicketTypesByIds(ticketTypeIds).stream()
                        .collect(Collectors.toMap(TicketTypeView::id, TicketTypeView::name));

        ConcertView concert =
                concertOrderPort
                        .findConcertById(concertId)
                        .orElseThrow(
                                () ->
                                        new AppException(
                                                ErrorCode.CONCERT_NOT_FOUND,
                                                "error.concert-not-found"));

        var schedule = places.forTickets(tickets.stream().map(Ticket::getId).toList());
        return tickets.stream().map(ticket -> toResponse(ticket, concert.title(),
                ticketTypeMap.getOrDefault(ticket.getTicketTypeId(), fallbackNames.unknownTicketType()),
                schedule.get(ticket.getId()))).toList();
    }

    @Transactional
    public TicketResponse updateTicketStatus(UUID ticketId, String newStatus) {
        return updateTicketStatus(ticketId, newStatus, null, true);
    }

    @Transactional
    public TicketResponse updateTicketStatus(
            UUID ticketId, String newStatus, UUID requesterId, boolean admin) {
        Ticket t =
                ticketRepository
                        .findById(ticketId)
                        .orElseThrow(
                                () ->
                                        new AppException(
                                                ErrorCode.TICKET_NOT_FOUND,
                                                "error.ticket-not-found"));
        if (!admin && !concertOrderPort.isConcertOwnedBy(t.getConcertId(), requesterId)) {
            throw new AppException(ErrorCode.TICKET_NOT_FOUND, "error.ticket-not-found");
        }

        t.setStatus(Ticket.Status.valueOf(newStatus));
        ticketRepository.save(t);

        ConcertView concert =
                concertOrderPort
                        .findConcertById(t.getConcertId())
                        .orElseThrow(
                                () ->
                                        new AppException(
                                                ErrorCode.CONCERT_NOT_FOUND,
                                                "error.concert-not-found"));

        TicketTypeView ticketType =
                concertOrderPort.findTicketTypesByIds(List.of(t.getTicketTypeId())).stream()
                        .findFirst()
                        .orElseThrow(
                                () ->
                                        new AppException(
                                                ErrorCode.RESOURCE_NOT_FOUND,
                                                "error.ticket-type.not-found"));

        return toResponse(t, concert.title(), ticketType.name(), places.forTickets(List.of(t.getId())).get(t.getId()));
    }

    private static TicketResponse toResponse(Ticket ticket, String title, String typeName, Place place) {
        return new TicketResponse(ticket.getId(), ticket.getConcertId(), place == null ? title : place.title(),
                ticket.getTicketTypeId(), place == null ? typeName : place.offerName(), ticket.getQrCode(),
                ticket.getStatus().name(), ticket.getIssuedAt(), place == null ? null : place.performanceId(),
                place == null ? null : place.eventId(), place == null ? null : place.venueName(),
                place == null ? null : place.startsAt(), place == null ? null : place.sectionLabel(),
                place == null ? null : place.rowLabel(), place == null ? null : place.seatLabel(),
                ticket.getReferenceCode());
    }

    private void requireOwnedConcert(UUID concertId, UUID organizerId) {
        if (!concertOrderPort.isConcertOwnedBy(concertId, organizerId)) {
            throw new AppException(ErrorCode.CONCERT_NOT_FOUND, "error.concert-not-found");
        }
    }
}
