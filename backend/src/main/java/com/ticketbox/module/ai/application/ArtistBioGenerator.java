package com.ticketbox.module.ai.application;

/**
 * Provider-independent contract for generating an artist biography.
 *
 * <p>Concrete implementations are selected by {@link ArtistBioGeneratorResolver}.
 */
public interface ArtistBioGenerator {

    String provider();

    String model();

    ArtistBioGenerationResult generate(ArtistBioGenerationRequest request);
}
