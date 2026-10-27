package com.ticketbox.module.ai.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Content reviewed by an organizer before it becomes public concert copy. */
public record UpdateArtistBioRequest(
        @NotBlank(message = "Artist bio must not be blank")
        @Size(max = 2_000, message = "Artist bio must not exceed 2000 characters")
        String artistBio
) {
}
