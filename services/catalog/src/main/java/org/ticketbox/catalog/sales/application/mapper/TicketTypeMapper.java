package org.ticketbox.catalog.sales.application.mapper;

import org.mapstruct.BeanMapping;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.ticketbox.catalog.sales.application.dto.CreateTicketTypeRequest;
import org.ticketbox.catalog.sales.application.dto.TicketTypeResponse;
import org.ticketbox.catalog.sales.application.dto.UpdateTicketTypeRequest;
import org.ticketbox.catalog.sales.domain.TicketType;

@Mapper(
        componentModel = "spring",
        uses = InventoryMapping.class,
        injectionStrategy = org.mapstruct.InjectionStrategy.CONSTRUCTOR)
public interface TicketTypeMapper {

    @Mapping(target = "availableQty", source = "id", qualifiedByName = "available")
    @Mapping(target = "isActive", source = "active")
    public abstract TicketTypeResponse toResponse(TicketType ticketType);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "concertId", ignore = true)
    @Mapping(target = "availableQty", ignore = true)
    @Mapping(target = "active", ignore = true)
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "updatedAt", ignore = true)
    public abstract TicketType toEntity(CreateTicketTypeRequest request);

    @BeanMapping(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
    @Mapping(target = "id", ignore = true)
    @Mapping(target = "concertId", ignore = true)
    @Mapping(target = "availableQty", ignore = true) // Computed field
    @Mapping(target = "active", ignore = true)
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "updatedAt", ignore = true)
    public abstract void updateTicketTypeFromRequest(
            UpdateTicketTypeRequest request, @MappingTarget TicketType ticketType);
}
