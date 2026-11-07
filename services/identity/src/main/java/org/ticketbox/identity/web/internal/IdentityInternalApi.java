package org.ticketbox.identity.web.internal;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.ticketbox.identity.application.port.UserContactPort;
import org.ticketbox.identity.application.port.UserContactView;

import java.util.UUID;

@RestController
@RequestMapping("/internal/split")
public class IdentityInternalApi {
    private final UserContactPort contacts;

    public IdentityInternalApi(UserContactPort contacts) {
        this.contacts = contacts;
    }

    @GetMapping("/users/{id}")
    public UserContactView contact(@PathVariable UUID id) {
        return contacts.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }
}
