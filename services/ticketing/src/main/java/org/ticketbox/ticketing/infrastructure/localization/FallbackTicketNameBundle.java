package org.ticketbox.ticketing.infrastructure.localization;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.MessageSource;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.stereotype.Component;
import org.ticketbox.ticketing.application.port.FallbackTicketNames;

import java.util.Locale;

@Component
public class FallbackTicketNameBundle implements FallbackTicketNames {
    private final MessageSource messages;
    private final Locale defaultLocale;

    public FallbackTicketNameBundle(
            MessageSource messages,
            @Value("${ticketbox.i18n.default-language:vi}") String defaultLanguage) {
        this.messages = messages;
        this.defaultLocale = Locale.forLanguageTag(defaultLanguage);
    }

    @Override
    public String unknownConcert() {
        return text("display.concert.unknown");
    }

    @Override
    public String unknownTicketType() {
        return text("display.ticket-type.unknown");
    }

    @Override
    public String ticket() {
        return text("display.ticket.default-name");
    }

    private String text(String key) {
        var context = LocaleContextHolder.getLocaleContext();
        Locale locale =
                context != null && context.getLocale() != null
                        ? context.getLocale()
                        : defaultLocale;
        return messages.getMessage(key, null, locale);
    }
}
