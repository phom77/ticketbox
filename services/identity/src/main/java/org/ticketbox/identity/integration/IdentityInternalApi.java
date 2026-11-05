package org.ticketbox.identity.integration;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@RestController
@RequestMapping("/internal/split")
public class IdentityInternalApi {
    private final UserContactAdapter contacts;

    public IdentityInternalApi(UserContactAdapter contacts) {
        this.contacts = contacts;
    }

    @GetMapping("/users/{id}")
    public UserContactView contact(@PathVariable UUID id) {
        return contacts.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }
}
