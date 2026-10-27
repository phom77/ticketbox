package com.ticketbox.module.ai.web.dto;

import jakarta.validation.constraints.NotEmpty;
import java.util.List;
import java.util.UUID;

public record ComposeArtistBioRequest(
        @NotEmpty(message = "Select at least one completed AI draft")
        List<UUID> sourceJobIds
) {
}
