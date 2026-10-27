package com.ticketbox.module.concert.application.mapper;

import com.ticketbox.module.concert.domain.TicketType;
import com.ticketbox.module.concert.web.dto.CreateTicketTypeRequest;
import com.ticketbox.module.concert.web.dto.TicketTypeResponse;
import com.ticketbox.module.concert.web.dto.UpdateTicketTypeRequest;
import org.mapstruct.BeanMapping;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.mapstruct.NullValuePropertyMappingStrategy;

@Mapper(componentModel = "spring", uses = InventoryMapping.class, injectionStrategy = org.mapstruct.InjectionStrategy.CONSTRUCTOR)
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
    public abstract void updateTicketTypeFromRequest(UpdateTicketTypeRequest request, @MappingTarget TicketType ticketType);
}
