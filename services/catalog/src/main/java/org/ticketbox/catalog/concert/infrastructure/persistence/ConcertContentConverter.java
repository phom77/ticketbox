package org.ticketbox.catalog.concert.infrastructure.persistence;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.AttributeConverter;
import org.ticketbox.catalog.concert.domain.ConcertContent;

public class ConcertContentConverter implements AttributeConverter<ConcertContent, String> {
    private final ObjectMapper json = new ObjectMapper();

    @Override
    public String convertToDatabaseColumn(ConcertContent value) {
        if (value == null) return null;
        try {
            return json.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Could not encode concert content", e);
        }
    }

    @Override
    public ConcertContent convertToEntityAttribute(String value) {
        if (value == null) return null;
        try {
            return json.readValue(value, ConcertContent.class);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Could not decode concert content", e);
        }
    }
}
