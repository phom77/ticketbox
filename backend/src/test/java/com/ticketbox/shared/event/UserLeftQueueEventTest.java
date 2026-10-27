package com.ticketbox.shared.event;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;

class UserLeftQueueEventTest {
    @Test
    void legacyOutboxPayloadRoundTripsWithoutChangingItsCompletionIdentity() throws Exception {
        var json=new ObjectMapper(); var concert=UUID.randomUUID(); var user=UUID.randomUUID();
        String legacy="{\"concertId\":\""+concert+"\",\"userId\":\""+user+"\"}";
        var event=json.readValue(legacy,UserLeftQueueEvent.class);
        assertThat(event.sessionToken()).isNull();
        assertThat(json.writeValueAsString(event)).isEqualTo(legacy);
    }
    @Test
    void shoppingGenerationIsRetainedForDurableDelayedLeave() throws Exception {
        var json=new ObjectMapper(); var event=new UserLeftQueueEvent(UUID.randomUUID(),UUID.randomUUID(),"generation");
        assertThat(json.readValue(json.writeValueAsString(event),UserLeftQueueEvent.class)).isEqualTo(event);
    }
}
