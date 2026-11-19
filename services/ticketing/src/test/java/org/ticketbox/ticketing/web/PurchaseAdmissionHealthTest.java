package org.ticketbox.ticketing.web;

import static org.mockito.Mockito.*;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.ticketbox.ticketing.queue.application.port.AdmissionHealth;
import org.ticketbox.ticketing.queue.application.port.AdmissionHealth.Path;

import java.util.UUID;

class PurchaseAdmissionHealthTest {
    @Test
    void countsStockConflictsAsNormalAndIgnoresInvalidRequestsAndPerAccountLimits() {
        var health = mock(AdmissionHealth.class);
        when(health.enabled()).thenReturn(true);
        var interceptor = new PurchaseAdmissionHealthInterceptor(health);
        var concert = UUID.randomUUID();
        observe(interceptor, concert, 409, false);
        observe(interceptor, concert, 400, false);
        observe(interceptor, concert, 429, false);
        verify(health).record(concert, Path.CHECKOUT, false, false, false);
        verify(health, times(3)).enabled();
        verifyNoMoreInteractions(health);
    }

    @Test
    void separatesGlobalThrottlingAndTechnicalErrors() {
        var health = mock(AdmissionHealth.class);
        when(health.enabled()).thenReturn(true);
        var interceptor = new PurchaseAdmissionHealthInterceptor(health);
        var concert = UUID.randomUUID();
        observe(interceptor, concert, 429, true);
        observe(interceptor, concert, 503, false);
        verify(health).record(null, Path.CHECKOUT, false, true, true);
        verify(health).record(concert, Path.CHECKOUT, false, true, true);
    }

    private void observe(PurchaseAdmissionHealthInterceptor interceptor, UUID concert, int status,
            boolean globalThrottle) {
        var request = new MockHttpServletRequest("POST", "/api/orders");
        var response = new MockHttpServletResponse();
        interceptor.preHandle(request, response, new Object());
        request.setAttribute(PurchaseAdmissionHealthInterceptor.CONCERT, concert);
        request.setAttribute(PurchaseAdmissionHealthInterceptor.GLOBAL_THROTTLE, globalThrottle);
        response.setStatus(status);
        interceptor.afterCompletion(request, response, new Object(), null);
    }
}
