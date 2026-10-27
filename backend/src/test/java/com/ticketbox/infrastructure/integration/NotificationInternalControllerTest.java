package com.ticketbox.infrastructure.integration;

import com.ticketbox.infrastructure.security.JwtService;
import com.ticketbox.infrastructure.security.SecurityConfig;
import com.ticketbox.module.auth.UserContactPort;
import com.ticketbox.module.auth.UserContactView;
import com.ticketbox.module.ticket.OrderPort;
import com.ticketbox.module.ticket.ETicketDocumentPort;
import com.ticketbox.shared.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import java.util.Optional;
import java.util.UUID;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers=NotificationInternalController.class, properties={
        "ticketbox.notifications.mode=remote",
        "ticketbox.notifications.service-token=internal-test-token-at-least-32-characters"
})
@Import({SecurityConfig.class,GlobalExceptionHandler.class})
class NotificationInternalControllerTest {
    @Autowired MockMvc api;
    @MockBean JwtService jwt;
    @MockBean UserContactPort users;
    @MockBean OrderPort orders;
    @MockBean ETicketDocumentPort documents;
    @Test void serviceDataRequiresTheDedicatedCredential() throws Exception {
        String path="/internal/notifications/users/"+UUID.randomUUID();
        api.perform(get(path)).andExpect(status().isUnauthorized());
        api.perform(get(path).header("X-Service-Token","wrong")).andExpect(status().isUnauthorized());
    }
    @Test void validServiceCredentialReturnsOnlyContactContract() throws Exception {
        UUID id=UUID.randomUUID();when(users.findById(id)).thenReturn(Optional.of(new UserContactView(id,"fixture@ticketbox.test","Fixture")));
        api.perform(get("/internal/notifications/users/"+id).header("X-Service-Token","internal-test-token-at-least-32-characters"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.email").value("fixture@ticketbox.test"))
            .andExpect(jsonPath("$.passwordHash").doesNotExist());
    }
}
