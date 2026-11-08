package org.ticketbox.catalog.artistbio.infrastructure;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.MessageSource;
import org.springframework.stereotype.Component;
import org.ticketbox.catalog.artistbio.application.port.ArtistBioMessages;

import java.util.Locale;

@Component
public class ArtistBioMessageBundle implements ArtistBioMessages {
    private final MessageSource messages;
    private final Locale locale;

    public ArtistBioMessageBundle(
            MessageSource messages,
            @Value("${ticketbox.i18n.artist-bio-language:vi}") String language) {
        this.messages = messages;
        this.locale = Locale.forLanguageTag(language);
    }

    @Override
    public String text(String key, Object... arguments) {
        return messages.getMessage(key, arguments, key, locale);
    }
}
