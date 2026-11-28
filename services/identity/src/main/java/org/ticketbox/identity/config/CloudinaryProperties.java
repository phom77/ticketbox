package org.ticketbox.identity.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "ticketbox.cloudinary")
public record CloudinaryProperties(String cloudName, String apiKey, String apiSecret, String logoFolder) {}
