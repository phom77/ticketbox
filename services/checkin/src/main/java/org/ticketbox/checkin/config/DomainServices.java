package org.ticketbox.checkin.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.ticketbox.checkin.guestlist.domain.PhoneNormalizer;

@Configuration(proxyBeanMethods = false)
public class DomainServices {
    @Bean
    PhoneNormalizer phoneNormalizer() {
        return new PhoneNormalizer();
    }
}
