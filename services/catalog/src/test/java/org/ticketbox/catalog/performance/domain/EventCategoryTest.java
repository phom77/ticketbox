package org.ticketbox.catalog.performance.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class EventCategoryTest {
    @Test
    void pinsTheSixIdsTheWebAppShows() {
        assertThat(EventCategory.ids())
                .containsExactly("concerts", "festivals", "sports", "arts-theater", "comedy", "family");
    }

    @Test
    void parsesKnownIdsExactlyAndRejectsEverythingElse() {
        assertThat(EventCategory.parse("arts-theater")).contains(EventCategory.ARTS_THEATER);
        for (String value : List.of("Concerts", "opera-gala", "", " sports", "music")) {
            assertThat(EventCategory.parse(value)).isEmpty();
        }
        assertThat(EventCategory.parse(null)).isEmpty();
    }
}
