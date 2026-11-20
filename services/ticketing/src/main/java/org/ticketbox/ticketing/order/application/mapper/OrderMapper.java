package org.ticketbox.ticketing.order.application.mapper;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.ticketbox.ticketing.order.application.dto.OrderItemResponse;
import org.ticketbox.ticketing.order.application.dto.OrderResponse;
import org.ticketbox.ticketing.order.domain.Order;
import org.ticketbox.ticketing.order.domain.OrderItem;

import java.util.List;

@Mapper(componentModel = "spring")
public interface OrderMapper {

    @Mapping(target = "id", source = "order.id")
    @Mapping(target = "status", expression = "java(order.getStatus().name())")
    @Mapping(target = "createdAt", source = "order.createdAt")
    @Mapping(target = "eventId", source = "order.performanceEventId")
    @Mapping(target = "items", source = "items")
    OrderResponse toResponse(Order order, List<OrderItemResponse> items, String concertTitle);

    @Mapping(target = "id", source = "item.id")
    @Mapping(target = "ticketTypeName", expression = "java(item.getOfferName() == null ? ticketTypeName : item.getOfferName())")
    OrderItemResponse toItemResponse(OrderItem item, String ticketTypeName);
}
