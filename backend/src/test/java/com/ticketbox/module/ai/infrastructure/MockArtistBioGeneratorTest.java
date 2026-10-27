package com.ticketbox.module.ai.infrastructure;

import com.ticketbox.module.ai.application.ArtistBioGenerationRequest;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class MockArtistBioGeneratorTest {

    private final MockArtistBioGenerator generator = new MockArtistBioGenerator();

    @Test
    void generate_MultiArtistCompositionKeepsSeparateSections() {
        String sourceText = """
                Composition mode: MULTI_ARTIST
                Detected artists: Minh Anh Collective, The Horizon Lights

                Artist: Minh Anh Collective
                Nguon: artist-bio-1.pdf
                Minh Anh Collective la nghe si indie pop.

                Artist: The Horizon Lights
                Nguon: artist-bio-2.pdf
                The Horizon Lights la ban nhac alternative rock.
                """;

        String bio = generator.generate(new ArtistBioGenerationRequest(
                "TicketBox Live",
                sourceText,
                "Vietnamese",
                280,
                "Return one section per artist.")).bio();

        assertThat(bio).contains("Minh Anh Collective\n");
        assertThat(bio).contains("The Horizon Lights\n");
        assertThat(bio).contains("mot muc rieng");
    }

    @Test
    void generate_SameArtistCompositionReturnsSingleDraft() {
        String sourceText = """
                Composition mode: SAME_ARTIST
                Detected artists: Minh Anh Collective

                Artist: Minh Anh Collective
                Nguon: first.pdf
                Artist: Minh Anh Collective
                Genre: Indie pop

                Nguon: second.pdf
                Minh Anh Collective la nghe si live synth.
                """;

        String bio = generator.generate(new ArtistBioGenerationRequest(
                "TicketBox Live",
                sourceText,
                "Vietnamese",
                140,
                "Return one cohesive biography.")).bio();

        assertThat(bio).contains("Minh Anh Collective");
        assertThat(bio).doesNotContain("mot muc rieng");
    }
}
