package org.ticketbox.checkin.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration(proxyBeanMethods = false)
class AdmissionClientConfig {
    @Bean
    RestClient serviceClient(@Value("${split.token}") String token) {
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(2000);
        factory.setReadTimeout(5000);
        return RestClient.builder()
                .requestFactory(factory)
                .defaultHeader("X-Service-Token", token)
                .build();
    }
}
