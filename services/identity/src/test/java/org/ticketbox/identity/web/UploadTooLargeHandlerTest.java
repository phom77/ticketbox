package org.ticketbox.identity.web;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

class UploadTooLargeHandlerTest {
    @Test
    void anOversizedUploadIsATranslatedPayloadTooLargeError() {
        var response = new GlobalExceptionHandler().handleUploadTooLarge(new MaxUploadSizeExceededException(3_145_728));
        assertThat(response.getStatusCode().value()).isEqualTo(413);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getMessage()).isEqualTo("error.logo.too-large");
    }
}
