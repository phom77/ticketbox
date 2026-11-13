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

    @Bean
    WebMvcConfigurer buyerSessionConfigurer(org.ticketbox.ticketing.web.security.BuyerSessions sessions) {
        return new WebMvcConfigurer() {
            @Override
            public void addInterceptors(InterceptorRegistry registry) {
                registry.addInterceptor(new org.springframework.web.servlet.HandlerInterceptor() {
                    @Override
                    public boolean preHandle(jakarta.servlet.http.HttpServletRequest request,
                            jakarta.servlet.http.HttpServletResponse response, Object handler) {
                        if (handler instanceof org.springframework.web.method.HandlerMethod) {
                            sessions.require(request.getHeader(org.springframework.http.HttpHeaders.AUTHORIZATION));
                        }
                        return true;
                    }
                }).addPathPatterns("/api/orders/**", "/api/tickets/**", "/api/payments/**",
                        "/api/mock-payments/**", "/api/queue/**", "/api/reservations/**")
                        .excludePathPatterns("/api/payments/webhooks/**");
            }
        };
    }
}
