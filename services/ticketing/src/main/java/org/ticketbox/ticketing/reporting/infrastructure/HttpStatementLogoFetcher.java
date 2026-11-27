package org.ticketbox.ticketing.reporting.infrastructure;

import lombok.extern.slf4j.Slf4j;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.ticketbox.ticketing.reporting.application.port.StatementLogoFetcher;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Arrays;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/** Fetches an organization logo for a statement: allowed hosts only, 3 s, 1 MB, PNG or JPEG. Failure is not fatal. */
@Slf4j
@Component
class HttpStatementLogoFetcher implements StatementLogoFetcher {
    static final int MAX_BYTES = 1024 * 1024;
    private static final Duration TIMEOUT = Duration.ofSeconds(3);

    private final Set<String> hosts;
    private final boolean allowPlainHttp;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(TIMEOUT)
            .followRedirects(HttpClient.Redirect.NEVER).build();

    @Autowired
    HttpStatementLogoFetcher(@Value("${ticketbox.statements.logo-hosts:res.cloudinary.com}") String hosts) {
        this(Arrays.stream(hosts.split(",")).map(String::strip).filter(h -> !h.isEmpty()).collect(Collectors.toSet()),
                false);
    }

    HttpStatementLogoFetcher(Set<String> hosts, boolean allowPlainHttp) {
        this.hosts = hosts;
        this.allowPlainHttp = allowPlainHttp;
    }

    @Override
    public Optional<byte[]> fetch(String url) {
        try {
            URI uri = URI.create(url);
            boolean secure = "https".equals(uri.getScheme()) || allowPlainHttp && "http".equals(uri.getScheme());
            if (!secure || uri.getHost() == null || !hosts.contains(uri.getHost())) {
                return Optional.empty();
            }
            HttpResponse<InputStream> response = client.send(HttpRequest.newBuilder(uri).timeout(TIMEOUT).GET().build(),
                    HttpResponse.BodyHandlers.ofInputStream());
            if (response.statusCode() != 200) {
                response.body().close();
                return Optional.empty();
            }
            try (InputStream body = response.body()) {
                byte[] bytes = body.readNBytes(MAX_BYTES + 1);
                return bytes.length <= MAX_BYTES && image(bytes) ? Optional.of(bytes) : Optional.empty();
            }
        } catch (IOException | IllegalArgumentException | SecurityException failure) {
            log.warn("Statement logo not fetched: {}", failure.getMessage());
            return Optional.empty();
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            return Optional.empty();
        }
    }

    private static boolean image(byte[] b) {
        boolean png = b.length > 8 && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G';
        boolean jpeg = b.length > 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF;
        return png || jpeg;
    }
}
