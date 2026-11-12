package org.ticketbox.ticketing.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.ticketbox.ticketing.web.security.OrganizationAccess;

@Configuration(proxyBeanMethods = false)
class OrganizationAccessConfig {
    @Bean
    WebMvcConfigurer organizationAccessConfigurer(
            RestClient serviceClient, @Value("${split.identity-url}") String identity) {
        var interceptor = new OrganizationAccess(serviceClient, identity);
        return new WebMvcConfigurer() {
            @Override
            public void addInterceptors(InterceptorRegistry registry) {
                registry.addInterceptor(interceptor).addPathPatterns("/api/admin/**", "/api/organizer/**");
            }
        };
    }
}
