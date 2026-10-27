package com.ticketbox.module.ai.application;

public record ArtistBioGenerationRequest(
        String concertTitle,
        String sourceText,
        String language,
        int desiredLength,
        String compositionInstruction) {

    public ArtistBioGenerationRequest(
            String concertTitle,
            String sourceText,
            String language,
            int desiredLength) {
        this(
                concertTitle,
                sourceText,
                language,
                desiredLength,
                "Write one cohesive artist biography from the supplied document text.");
    }
}
