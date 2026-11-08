package org.ticketbox.catalog.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.MessageSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.LocaleResolver;
import org.springframework.web.servlet.i18n.AcceptHeaderLocaleResolver;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

@RestControllerAdvice
public class ApiMessages implements ResponseBodyAdvice<Object> {
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
                String.join(
                        ",",
                        java.util.Collections.list(
                                request.getHeaders(HttpHeaders.ACCEPT_LANGUAGE)));
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

    public String text(String key, Locale locale, Object... arguments) {
        return messages.getMessage(key, arguments, key, locale);
    }

    @Override
    public boolean supports(
            MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converterType) {
        return true;
    }

    @Override
    public Object beforeBodyWrite(
            Object body,
            MethodParameter returnType,
            MediaType contentType,
            Class<? extends HttpMessageConverter<?>> converterType,
            ServerHttpRequest request,
            ServerHttpResponse response) {
        if (!(body instanceof ApiResponse<?> envelope)) return body;

        Locale locale = LocaleContextHolder.getLocale();
        response.getHeaders().add(HttpHeaders.VARY, HttpHeaders.ACCEPT_LANGUAGE);
        response.getHeaders().set(HttpHeaders.CONTENT_LANGUAGE, locale.toLanguageTag());
        return localize(envelope, locale);
    }

    public <T> ApiResponse<T> localize(
            ApiResponse<T> body, HttpServletRequest request, HttpServletResponse response) {
        Locale locale = resolveLocale(request);
        response.addHeader(HttpHeaders.VARY, HttpHeaders.ACCEPT_LANGUAGE);
        response.setHeader(HttpHeaders.CONTENT_LANGUAGE, locale.toLanguageTag());
        return localize(body, locale);
    }

    private <T> ApiResponse<T> localize(ApiResponse<T> body, Locale locale) {
        var details = body.getDetails();
        if (details != null && details.containsValue("error.invalid-value")) {
            details =
                    details.entrySet().stream()
                            .collect(
                                    Collectors.toMap(
                                            java.util.Map.Entry::getKey,
                                            entry -> text(entry.getValue(), locale)));
        }
        return body.withMessages(text(body.getMessage(), locale, body.messageArguments()), details);
    }
}
