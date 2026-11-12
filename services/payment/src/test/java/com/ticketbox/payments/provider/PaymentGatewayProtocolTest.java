package com.ticketbox.payments.provider;

import static org.assertj.core.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ticketbox.payments.config.MomoProperties;
import com.ticketbox.payments.config.VnpayProperties;
import com.ticketbox.payments.domain.OrderView;
import com.ticketbox.payments.infrastructure.provider.MomoPaymentGateway;
import com.ticketbox.payments.infrastructure.provider.MockPaymentGateway;
import com.ticketbox.payments.infrastructure.provider.PaymentGatewayResolver;
import com.ticketbox.payments.infrastructure.provider.VnpayPaymentGateway;
import com.ticketbox.payments.domain.Provider;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.util.Map;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

class PaymentGatewayProtocolTest {
    @Test
    void momoCreateUsesPersistedIdAndSignedQueryCorrelatesResponse() throws Exception {
        var mapper = new ObjectMapper();
        var captured = new AtomicReference<String>();
        var description = new AtomicReference<String>();
        var server =
                com.sun.net.httpserver.HttpServer.create(
                        new java.net.InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(
                "/create",
                exchange -> {
                    var request = mapper.readTree(exchange.getRequestBody());
                    captured.set(request.path("requestId").asText());
                    description.set(request.path("orderInfo").asText());
                    byte[] response =
                            "{\"payUrl\":\"https://fake.local/pay\",\"resultCode\":0}"
                                    .getBytes(java.nio.charset.StandardCharsets.UTF_8);
                    exchange.getResponseHeaders().add("Content-Type", "application/json");
                    exchange.sendResponseHeaders(200, response.length);
                    exchange.getResponseBody().write(response);
                    exchange.close();
                });
        server.createContext(
                "/query",
                exchange -> {
                    var request = mapper.readTree(exchange.getRequestBody());
                    String signed =
                            "accessKey=access&orderId="
                                    + request.path("orderId").asText()
                                    + "&partnerCode=partner&requestId="
                                    + request.path("requestId").asText();
                    assertThat(request.path("signature").asText())
                            .isEqualTo(hmac("HmacSHA256", "secret", signed));
                    byte[] response =
                            mapper.writeValueAsBytes(
                                    Map.of(
                                            "partnerCode",
                                            "partner",
                                            "orderId",
                                            request.path("orderId").asText(),
                                            "requestId",
                                            request.path("requestId").asText(),
                                            "resultCode",
                                            0,
                                            "amount",
                                            250000,
                                            "transId",
                                            1234));
                    exchange.getResponseHeaders().add("Content-Type", "application/json");
                    exchange.sendResponseHeaders(200, response.length);
                    exchange.getResponseBody().write(response);
                    exchange.close();
                });
        server.start();
        try {
            var gateway =
                    new MomoPaymentGateway(
                            new MomoProperties(
                                    "http://127.0.0.1:" + server.getAddress().getPort() + "/create",
                                    "partner",
                                    "access",
                                    "secret",
                                    "http://return",
                                    "http://ipn"),
                            mapper);
            var order =
                    new OrderView(
                            UUID.randomUUID(),
                            UUID.randomUUID(),
                            BigDecimal.valueOf(250000),
                            "AWAITING_PAYMENT",
                            null,
                            null,
                            null);
            gateway.initiatePayment(order, "persisted-request");
            assertThat(captured.get()).isEqualTo("persisted-request");
            assertThat(description.get()).isEqualTo("Thanh toan ve TicketBox " + order.id());
            gateway.initiatePayment(order, "persisted-request");
            assertThat(captured.get()).isEqualTo("persisted-request");
            var query = gateway.queryPayment(order, "persisted-request", null);
            assertThat(query.verified()).isTrue();
            assertThat(query.success()).isTrue();
            assertThat(query.amount()).isEqualByComparingTo(order.totalAmount());
            assertThat(query.transactionId()).isEqualTo("1234");
        } finally {
            server.stop(0);
        }
    }

    @Test
    void stagingListsOnlyVnpayWithCompleteHttpsConfiguration() {
        var gateway = new VnpayPaymentGateway(new VnpayProperties("https://sandbox.example/pay",
                "https://staging.example/payment/result", "https://staging.example/api/payments/webhooks/vnpay",
                "tmn", "secret", "vn", "other"));
        var mock = new MockPaymentGateway("http://localhost:8080");
        var environment = new MockEnvironment();
        environment.setActiveProfiles("staging");
        var resolver = new PaymentGatewayResolver(List.of(gateway, mock), environment);
        assertThat(resolver.available()).isEmpty();
        assertThatThrownBy(() -> resolver.forNewAttempt(Provider.MOCK)).hasMessageContaining("disabled");
        assertThatThrownBy(() -> resolver.forNewAttempt(Provider.VNPAY)).hasMessageContaining("incomplete");
        ReflectionTestUtils.setField(gateway, "queryUrl", "https://sandbox.example/query");
        assertThat(resolver.available()).containsExactly("VNPAY");
        assertThat(resolver.forNewAttempt(Provider.VNPAY)).isSameAs(gateway);
    }

    @Test
    void vnpaySignedQueryVerifiesMerchantOrderAndTransactionIdentity() throws Exception {
        var mapper = new ObjectMapper();
        var variant = new AtomicReference<>("valid");
        var request = new AtomicReference<com.fasterxml.jackson.databind.JsonNode>();
        var server = com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/query", exchange -> {
            var query = mapper.readTree(exchange.getRequestBody());
            request.set(query);
            var fields = new LinkedHashMap<String, String>();
            fields.put("vnp_ResponseId", "fixture-response");
            fields.put("vnp_Command", "querydr");
            fields.put("vnp_ResponseCode", "00");
            fields.put("vnp_Message", "success");
            fields.put("vnp_TmnCode", "merchant".equals(variant.get()) ? "wrong" : "tmn");
            fields.put("vnp_TxnRef", "order".equals(variant.get()) ? UUID.randomUUID().toString() : query.path("vnp_TxnRef").asText());
            fields.put("vnp_Amount", "25000000");
            fields.put("vnp_BankCode", "fixture-bank");
            fields.put("vnp_PayDate", "20261112120000");
            fields.put("vnp_TransactionNo", "transaction".equals(variant.get()) ? "0" : "1234");
            fields.put("vnp_TransactionType", "01");
            fields.put("vnp_TransactionStatus", "00");
            fields.put("vnp_OrderInfo", "fixture");
            fields.put("vnp_PromotionCode", "");
            fields.put("vnp_PromotionAmount", "");
            fields.put("vnp_SecureHash", "signature".equals(variant.get()) ? "invalid"
                    : hmac("HmacSHA512", "secret", String.join("|", fields.values())));
            byte[] response = mapper.writeValueAsBytes(fields);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            try (var body = exchange.getResponseBody()) {
                body.write(response);
            }
        });
        server.start();
        try {
            var gateway = new VnpayPaymentGateway(new VnpayProperties("https://sandbox.example/pay",
                    "https://staging.example/return", null, "tmn", "secret", "vn", "other"));
            ReflectionTestUtils.setField(gateway, "queryUrl", "http://127.0.0.1:" + server.getAddress().getPort() + "/query");
            var order = new OrderView(UUID.randomUUID(), UUID.randomUUID(), BigDecimal.valueOf(250000),
                    "AWAITING_PAYMENT", null, null, null);
            String initiation = "{\"vnp_CreateDate\":\"20261112115900\"}";
            var result = gateway.queryPayment(order, "fixture-request", initiation);
            assertThat(result.verified()).isTrue();
            assertThat(result.success()).isTrue();
            assertThat(result.amount()).isEqualByComparingTo(order.totalAmount());
            assertThat(result.transactionId()).isEqualTo("1234");
            assertThat(request.get().path("vnp_TransactionDate").asText()).isEqualTo("20261112115900");
            for (String invalid : List.of("merchant", "order", "transaction", "signature")) {
                variant.set(invalid);
                assertThat(gateway.queryPayment(order, "fixture-request", initiation).verified()).as(invalid).isFalse();
            }
        } finally {
            server.stop(0);
        }
    }

    @Test
    void vnpayUrlExpiresAtOrderDeadlineAndRejectsTamperedCallback() throws Exception {
        var mapper = new ObjectMapper();
        var gateway =
                new VnpayPaymentGateway(
                        new VnpayProperties(
                                "https://fake.local/pay",
                                "http://return",
                                null,
                                "tmn",
                                "secret",
                                "vn",
                                "other"));
        var deadline = java.time.OffsetDateTime.now().plusMinutes(3);
        var order =
                new OrderView(
                        UUID.randomUUID(),
                        UUID.randomUUID(),
                        BigDecimal.TEN,
                        "AWAITING_PAYMENT",
                        null,
                        null,
                        null,
                        deadline);
        var result = gateway.initiatePayment(order);
        var params = new java.util.TreeMap<String, String>();
        mapper.readTree(result.rawPayload())
                .fields()
                .forEachRemaining(e -> params.put(e.getKey(), e.getValue().asText()));
        assertThat(params.get("vnp_OrderInfo")).isEqualTo("Thanh toan don hang " + order.id());
        assertThat(params.get("vnp_ExpireDate"))
                .isEqualTo(
                        deadline.atZoneSameInstant(java.time.ZoneId.of("Asia/Ho_Chi_Minh"))
                                .format(
                                        java.time.format.DateTimeFormatter.ofPattern(
                                                "yyyyMMddHHmmss")));
        params.clear();
        params.put("vnp_TmnCode", "tmn");
        params.put("vnp_TxnRef", order.id().toString());
        params.put("vnp_Amount", "1000");
        params.put("vnp_ResponseCode", "00");
        params.put("vnp_TransactionStatus", "00");
        params.put("vnp_TransactionNo", "1234");
        String signed =
                params.entrySet().stream()
                        .map(
                                e ->
                                        e.getKey()
                                                + "="
                                                + java.net.URLEncoder.encode(
                                                        e.getValue(),
                                                        java.nio.charset.StandardCharsets.US_ASCII))
                        .collect(java.util.stream.Collectors.joining("&"));
        params.put("vnp_SecureHash", hmac("HmacSHA512", "secret", signed));
        assertThat(gateway.verifyWebhook(params).valid()).isTrue();
        params.put("vnp_Amount", "2000");
        assertThat(gateway.verifyWebhook(params).valid()).isFalse();
    }

    @Test
    void momoSeparatesPendingFinalFailureAndOneStepAuthorization() {
        var gateway =
                new MomoPaymentGateway(
                        new MomoProperties(
                                "http://unused/create",
                                "partner",
                                "access",
                                "secret",
                                "http://return",
                                "http://ipn"),
                        new ObjectMapper());
        var p = new java.util.HashMap<String, String>();
        p.put("amount", "250000");
        p.put("orderId", UUID.randomUUID().toString());
        p.put("partnerCode", "partner");
        p.put("requestId", "stable");
        p.put("transId", "1234");
        String[] fields = {
            "amount",
            "extraData",
            "message",
            "orderId",
            "orderInfo",
            "orderType",
            "partnerCode",
            "payType",
            "requestId",
            "responseTime",
            "resultCode",
            "transId"
        };
        for (String code : java.util.List.of("1000", "7000", "7002", "9000", "1006")) {
            p.put("resultCode", code);
            String signed =
                    "accessKey=access&"
                            + java.util.Arrays.stream(fields)
                                    .map(f -> f + "=" + p.getOrDefault(f, ""))
                                    .collect(java.util.stream.Collectors.joining("&"));
            p.put("signature", hmac("HmacSHA256", "secret", signed));
            var result = gateway.verifyWebhook(p);
            assertThat(result.valid()).isTrue();
            assertThat(result.success()).isEqualTo("9000".equals(code));
            assertThat(result.pending())
                    .isEqualTo(java.util.Set.of("1000", "7000", "7002").contains(code));
        }
    }

    private static String hmac(String algorithm, String key, String data) {
        try {
            var mac = javax.crypto.Mac.getInstance(algorithm);
            mac.init(
                    new javax.crypto.spec.SecretKeySpec(
                            key.getBytes(java.nio.charset.StandardCharsets.UTF_8), algorithm));
            return java.util.HexFormat.of()
                    .formatHex(mac.doFinal(data.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new RuntimeException(exception);
        }
    }
}
