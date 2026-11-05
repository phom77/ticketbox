package org.ticketbox.identity;

import com.ticketbox.module.auth.UserContactPort;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.util.UUID;

@RestController
@RequestMapping("/internal/split")
public class IdentityInternalApi {
    private final UserContactPort contacts;

    public IdentityInternalApi(UserContactPort contacts) {
        this.contacts = contacts;
    }

    @GetMapping("/users/{id}")
    public Object contact(@PathVariable UUID id) {
        return contacts.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }
}
