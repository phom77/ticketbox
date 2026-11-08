package com.ticketbox.notifications.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.MessageSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.web.servlet.LocaleResolver;
import org.springframework.web.servlet.i18n.AcceptHeaderLocaleResolver;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

@Configuration
public class ApiMessages {
    private final MessageSource messages;
    private final List<Locale> supportedLocales;
    private final Locale defaultLocale;

    public ApiMessages(
            MessageSource messages,
            @Value("${ticketbox.i18n.languages:en,vi}") String languages,
            @Value("${ticketbox.i18n.default-language:vi}") String defaultLanguage) {
        this.messages = messages;
        this.supportedLocales =
                Arrays.stream(languages.split(","))
                        .map(String::strip)
                        .map(Locale::forLanguageTag)
                        .toList();
        this.defaultLocale = Locale.forLanguageTag(defaultLanguage);
        if (!supportedLocales.contains(defaultLocale)) {
            throw new IllegalArgumentException("The default language must be a supported language");
        }
    }

    @Bean
    public LocaleResolver localeResolver() {
        return new AcceptHeaderLocaleResolver() {
            @Override
            public Locale resolveLocale(HttpServletRequest request) {
                return ApiMessages.this.resolveLocale(request);
            }
        };
    }

    public Locale resolveLocale(HttpServletRequest request) {
        String header =
                String.join(",", Collections.list(request.getHeaders(HttpHeaders.ACCEPT_LANGUAGE)));
        if (header.isBlank()) return defaultLocale;

        try {
            var ranges =
                    Locale.LanguageRange.parse(header).stream()
                            .filter(range -> range.getWeight() > 0)
                            .toList();
            Locale locale = Locale.lookup(ranges, supportedLocales);
            return locale == null ? defaultLocale : locale;
        } catch (IllegalArgumentException malformedHeader) {
            return defaultLocale;
        }
    }

    public String responseText(String key, Locale locale, HttpServletResponse response) {
        response.addHeader(HttpHeaders.VARY, HttpHeaders.ACCEPT_LANGUAGE);
        response.setHeader(HttpHeaders.CONTENT_LANGUAGE, locale.toLanguageTag());
        return text(key, locale);
    }

    public String text(String key, Locale locale, Object... arguments) {
        return messages.getMessage(key, arguments, key, locale);
    }
}
