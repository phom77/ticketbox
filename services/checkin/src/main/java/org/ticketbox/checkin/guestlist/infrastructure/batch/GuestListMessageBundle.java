package org.ticketbox.checkin.guestlist.infrastructure.batch;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.MessageSource;
import org.springframework.stereotype.Component;
import org.ticketbox.checkin.guestlist.application.port.GuestListMessages;

import java.util.Locale;

@Component
public class GuestListMessageBundle implements GuestListMessages {
    private final MessageSource messages;
    private final Locale locale;

    public GuestListMessageBundle(
            MessageSource messages,
            @Value("${ticketbox.i18n.guest-import-language:vi}") String language) {
        this.messages = messages;
        this.locale = Locale.forLanguageTag(language);
    }

    @Override
    public String text(String key, Object... arguments) {
        return messages.getMessage(key, arguments, locale);
    }
}
