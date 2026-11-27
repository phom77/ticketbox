package org.ticketbox.ticketing.reporting.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;

import com.sun.net.httpserver.HttpServer;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.util.Set;

class HttpStatementLogoFetcherTest {
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0};
    private HttpServer server;
    private String base;

    @BeforeEach
    void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/ok.png", exchange -> send(exchange, 200, PNG));
        server.createContext("/text", exchange -> send(exchange, 200, "not an image".getBytes()));
        server.createContext("/big.png", exchange -> {
            byte[] big = new byte[HttpStatementLogoFetcher.MAX_BYTES + 10];
            System.arraycopy(PNG, 0, big, 0, PNG.length);
            send(exchange, 200, big);
        });
        server.createContext("/missing", exchange -> send(exchange, 404, new byte[0]));
        server.start();
        base = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    private static void send(com.sun.net.httpserver.HttpExchange exchange, int status, byte[] body) throws java.io.IOException {
        exchange.sendResponseHeaders(status, body.length == 0 ? -1 : body.length);
        if (body.length > 0) exchange.getResponseBody().write(body);
        exchange.close();
    }

    @Test
    void fetchesAnImageFromAnAllowedHost() {
        var fetcher = new HttpStatementLogoFetcher(Set.of("127.0.0.1"), true);
        assertThat(fetcher.fetch(base + "/ok.png")).hasValue(PNG);
    }

    @Test
    void refusesOtherHostsPlainHttpOversizeNonImagesAndErrors() {
        assertThat(new HttpStatementLogoFetcher(Set.of("res.cloudinary.com"), true).fetch(base + "/ok.png")).isEmpty();
        assertThat(new HttpStatementLogoFetcher(Set.of("127.0.0.1"), false).fetch(base + "/ok.png")).isEmpty();
        var fetcher = new HttpStatementLogoFetcher(Set.of("127.0.0.1"), true);
        assertThat(fetcher.fetch(base + "/big.png")).isEmpty();
        assertThat(fetcher.fetch(base + "/text")).isEmpty();
        assertThat(fetcher.fetch(base + "/missing")).isEmpty();
        assertThat(fetcher.fetch("not a url")).isEmpty();
    }
}
