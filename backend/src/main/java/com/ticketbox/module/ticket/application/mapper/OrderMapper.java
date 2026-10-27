package com.ticketbox.module.ticket.application.mapper;

import com.ticketbox.module.ticket.domain.Order;
import com.ticketbox.module.ticket.domain.OrderItem;
import com.ticketbox.module.ticket.web.dto.OrderItemResponse;
import com.ticketbox.module.ticket.web.dto.OrderResponse;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

import java.util.List;

@Mapper(componentModel = "spring")
public interface OrderMapper {

    @Mapping(target = "id", source = "order.id")
    @Mapping(target = "status", expression = "java(order.getStatus().name())")
    @Mapping(target = "createdAt", source = "order.createdAt")
    OrderResponse toResponse(Order order, List<OrderItemResponse> items, String concertTitle);

    @Mapping(target = "id", source = "item.id")
    @Mapping(target = "ticketTypeName", source = "ticketTypeName")
    OrderItemResponse toItemResponse(OrderItem item, String ticketTypeName);
}
