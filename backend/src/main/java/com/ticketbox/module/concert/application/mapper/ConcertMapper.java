package com.ticketbox.module.concert.application.mapper;

import com.ticketbox.module.concert.domain.Concert;
import com.ticketbox.module.concert.web.dto.ConcertDetailResponse;
import com.ticketbox.module.concert.web.dto.ConcertSummaryResponse;
import com.ticketbox.module.concert.web.dto.CreateConcertRequest;
import com.ticketbox.module.concert.web.dto.UpdateConcertRequest;
import org.mapstruct.BeanMapping;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.mapstruct.NullValuePropertyMappingStrategy;

@Mapper(componentModel = "spring")
public interface ConcertMapper {

    @Mapping(target = "ticketTypes", expression = "java(java.util.List.of())")
    ConcertDetailResponse toDetailResponse(Concert concert);

    ConcertSummaryResponse toSummaryResponse(Concert concert);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "status", ignore = true)
    @Mapping(target = "createdBy", ignore = true)
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "updatedAt", ignore = true)
    @Mapping(target = "artistBio", ignore = true)
    @Mapping(target = "posterUrl", ignore = true)
    @Mapping(target = "posterPublicId", ignore = true)
    @Mapping(target = "publicVisible", ignore = true)
    Concert toEntity(CreateConcertRequest request);

    @BeanMapping(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
    @Mapping(target = "id", ignore = true)
    @Mapping(target = "status", ignore = true)
    @Mapping(target = "createdBy", ignore = true)
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "updatedAt", ignore = true)
    @Mapping(target = "artistBio", ignore = true)
    @Mapping(target = "posterUrl", ignore = true)
    @Mapping(target = "posterPublicId", ignore = true)
    @Mapping(target = "publicVisible", ignore = true)
    void updateConcertFromRequest(UpdateConcertRequest request, @MappingTarget Concert concert);
}
