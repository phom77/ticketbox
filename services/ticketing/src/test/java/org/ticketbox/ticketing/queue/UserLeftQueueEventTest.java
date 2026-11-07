package org.ticketbox.ticketing.queue;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ticketbox.shared.event.UserLeftQueueEvent;

import org.junit.jupiter.api.Test;

import java.util.UUID;

class UserLeftQueueEventTest {
    @Test
    void legacyOutboxPayloadRoundTripsWithoutChangingItsCompletionIdentity() throws Exception {
        var json = new ObjectMapper();
        var concert = UUID.randomUUID();
        var user = UUID.randomUUID();
        String legacy = "{\"concertId\":\"" + concert + "\",\"userId\":\"" + user + "\"}";
        var event = json.readValue(legacy, UserLeftQueueEvent.class);
        assertThat(event.sessionToken()).isNull();
        assertThat(json.writeValueAsString(event)).isEqualTo(legacy);
    }

    @Test
    void shoppingGenerationIsRetainedForDurableDelayedLeave() throws Exception {
        var json = new ObjectMapper();
        var event = new UserLeftQueueEvent(UUID.randomUUID(), UUID.randomUUID(), "generation");
        assertThat(json.readValue(json.writeValueAsString(event), UserLeftQueueEvent.class))
                .isEqualTo(event);
    }
}
