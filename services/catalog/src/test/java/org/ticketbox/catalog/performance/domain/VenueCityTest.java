package org.ticketbox.catalog.performance.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class VenueCityTest {
    @Test
    void takesTheLastAddressPartWithoutTheCountry() {
        assertThat(VenueCity.of("1 Main Street, Hanoi, Vietnam")).isEqualTo("Hanoi");
        assertThat(VenueCity.of("12 Le Loi, District 1, Ho Chi Minh City, Việt Nam")).isEqualTo("Ho Chi Minh City");
        assertThat(VenueCity.of("Hoan Kiem District, Hanoi")).isEqualTo("Hanoi");
        assertThat(VenueCity.of("Hanoi, Viet Nam")).isEqualTo("Hanoi");
    }

    @Test
    void hasNoCityWithoutACommaOrWithAnEmptyPart() {
        assertThat(VenueCity.of("Main Street")).isNull();
        assertThat(VenueCity.of(null)).isNull();
        assertThat(VenueCity.of("Main Street, ")).isNull();
    }
}
