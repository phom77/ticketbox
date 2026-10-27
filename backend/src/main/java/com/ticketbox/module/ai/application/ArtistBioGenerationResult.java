package com.ticketbox.module.ai.application;

public record ArtistBioGenerationResult(
        String bio,
        String provider,
        String model) {
}
