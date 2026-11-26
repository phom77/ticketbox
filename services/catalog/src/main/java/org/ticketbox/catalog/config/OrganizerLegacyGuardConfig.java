package org.ticketbox.catalog.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.ticketbox.catalog.web.security.OrganizerLegacyGuard;

@Configuration(proxyBeanMethods = false)
class OrganizerLegacyGuardConfig {
    @Bean
    WebMvcConfigurer organizerLegacyGuardConfigurer(
            @Value("${ticketbox.organizer-legacy-read-only:true}") boolean readOnly) {
        return new WebMvcConfigurer() {
            @Override
            public void addInterceptors(InterceptorRegistry registry) {
                registry.addInterceptor(new OrganizerLegacyGuard(readOnly)).addPathPatterns("/api/organizer/**").order(10);
            }
        };
    }
}
