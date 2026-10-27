package com.ticketbox.module.ai.application;

import com.ticketbox.module.ai.infrastructure.AiProperties;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import java.util.Arrays;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
public class ArtistBioGeneratorResolver {

    private final AiProperties properties;
    private final Environment environment;
    private final ArtistBioGenerator openAiCompatibleGenerator;
    private final ArtistBioGenerator mockGenerator;

    public ArtistBioGeneratorResolver(
            AiProperties properties,
            Environment environment,
            @Qualifier("openAiCompatibleArtistBioGenerator")
                    ArtistBioGenerator openAiCompatibleGenerator,
            @Qualifier("mockArtistBioGenerator")
                    ArtistBioGenerator mockGenerator) {
        this.properties = properties;
        this.environment = environment;
        this.openAiCompatibleGenerator = openAiCompatibleGenerator;
        this.mockGenerator = mockGenerator;
    }

    public ArtistBioGenerator resolve() {
        String configured = properties.getProvider().trim().toLowerCase();
        return switch (configured) {
            case "mock" -> mockGenerator;
            case "openai-compatible" -> requireApiKey();
            case "auto" -> hasApiKey()
                    ? openAiCompatibleGenerator
                    : resolveAutoWithoutKey();
            default -> throw new AppException(
                    ErrorCode.INVALID_REQUEST,
                    "Nhà cung cấp AI không được hỗ trợ: " + properties.getProvider());
        };
    }

    private ArtistBioGenerator requireApiKey() {
        if (!hasApiKey()) {
            throw new AppException(
                    ErrorCode.AI_PROVIDER_UNAVAILABLE,
                    "Chưa cấu hình API key cho AI");
        }
        return openAiCompatibleGenerator;
    }

    private ArtistBioGenerator resolveAutoWithoutKey() {
        if (hasProfile("local") || hasProfile("dev")) {
            return mockGenerator;
        }
        throw new AppException(
                ErrorCode.AI_PROVIDER_UNAVAILABLE,
                "Chưa cấu hình API key cho AI");
    }

    private boolean hasApiKey() {
        return properties.getApiKey() != null && !properties.getApiKey().isBlank();
    }

    private boolean hasProfile(String expected) {
        return Arrays.stream(environment.getActiveProfiles()).anyMatch(expected::equals)
                || Arrays.stream(environment.getDefaultProfiles()).anyMatch(expected::equals);
    }
}
