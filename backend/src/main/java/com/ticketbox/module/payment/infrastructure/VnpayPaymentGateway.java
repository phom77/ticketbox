package com.ticketbox.module.payment.infrastructure;

import com.ticketbox.module.payment.application.gateway.PaymentGateway;
import com.ticketbox.module.payment.application.gateway.PaymentInitiationResult;
import com.ticketbox.module.payment.application.gateway.PaymentWebhookResult;
import com.ticketbox.module.payment.domain.PaymentLog;
import com.ticketbox.module.ticket.OrderView;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import java.util.stream.Collectors;

@Component
public class VnpayPaymentGateway implements PaymentGateway {
    private static final DateTimeFormatter VNPAY_DATE_FORMAT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    private static final ZoneId VNPAY_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private final VnpayProperties properties;
    @org.springframework.beans.factory.annotation.Value("${ticketbox.payment.vnpay.query-url:}")
    private String queryUrl = "";

    public VnpayPaymentGateway(VnpayProperties properties) {
        this.properties = properties;
    }

    @Override
    public PaymentLog.Provider provider() {
        return PaymentLog.Provider.VNPAY;
    }

    @Override
    @CircuitBreaker(name = "vnpay", fallbackMethod = "fallbackInitiatePayment")
    public PaymentInitiationResult initiatePayment(OrderView order) {
        requireConfigured();

        String providerRef = order.id().toString();
        LocalDateTime now = LocalDateTime.now(VNPAY_ZONE);
        TreeMap<String, String> params = new TreeMap<>();
        params.put("vnp_Version", "2.1.0");
        params.put("vnp_Command", "pay");
        params.put("vnp_TmnCode", properties.tmnCode());
        params.put("vnp_Amount", toVnpayAmount(order.totalAmount()));
        params.put("vnp_CurrCode", "VND");
        params.put("vnp_TxnRef", providerRef);
        params.put("vnp_OrderInfo", "Thanh toan don hang " + providerRef);
        params.put("vnp_OrderType", properties.orderTypeOrDefault());
        params.put("vnp_Locale", properties.localeOrDefault());
        params.put("vnp_ReturnUrl", properties.returnUrl());
        params.put("vnp_IpAddr", "127.0.0.1");
        params.put("vnp_CreateDate", now.format(VNPAY_DATE_FORMAT));
        params.put("vnp_ExpireDate", order.expiresAt().atZoneSameInstant(VNPAY_ZONE).format(VNPAY_DATE_FORMAT));

        String hashData = buildHashData(params);
        String secureHash = hmacSha512(properties.hashSecret(), hashData);
        String paymentUrl = properties.payUrl() + "?" + buildQuery(params) + "&vnp_SecureHash=" + secureHash;

        return new PaymentInitiationResult(provider(), paymentUrl, providerRef, toJsonLike(params));
    }

    @Override
    public PaymentWebhookResult verifyWebhook(Map<String, String> params) {
        requireConfigured();

        String rawPayload = toJsonLike(params);
        String receivedHash = params.get("vnp_SecureHash");
        if (receivedHash == null || receivedHash.isBlank()) {
            return PaymentWebhookResult.invalid("Missing VNPAY secure hash", rawPayload);
        }

        TreeMap<String, String> signedParams = params.entrySet().stream()
                .filter(entry -> entry.getValue() != null && !entry.getValue().isBlank())
                .filter(entry -> !entry.getKey().equals("vnp_SecureHash"))
                .filter(entry -> !entry.getKey().equals("vnp_SecureHashType"))
                .collect(Collectors.toMap(
                        Map.Entry::getKey,
                        Map.Entry::getValue,
                        (left, right) -> right,
                        TreeMap::new
                ));

        String expectedHash = hmacSha512(properties.hashSecret(), buildHashData(signedParams));
        if (!properties.tmnCode().equals(params.get("vnp_TmnCode")) ||
                !java.security.MessageDigest.isEqual(expectedHash.toLowerCase(java.util.Locale.ROOT).getBytes(StandardCharsets.US_ASCII),
                        receivedHash.toLowerCase(java.util.Locale.ROOT).getBytes(StandardCharsets.US_ASCII))) {
            return PaymentWebhookResult.invalid("Invalid VNPAY signature", rawPayload);
        }

        UUID orderId;
        try {
            orderId = UUID.fromString(params.get("vnp_TxnRef"));
        } catch (RuntimeException ex) {
            return PaymentWebhookResult.invalid("Invalid VNPAY order reference", rawPayload);
        }

        BigDecimal amount = fromVnpayAmount(params.get("vnp_Amount"));
        boolean success = "00".equals(params.get("vnp_ResponseCode"))
                && "00".equals(params.get("vnp_TransactionStatus"));
        String providerRef = params.getOrDefault("vnp_TransactionNo", params.get("vnp_TxnRef"));

        return new PaymentWebhookResult(true, success, orderId, providerRef, amount, rawPayload, null,
                !success && !"02".equals(params.get("vnp_TransactionStatus")));
    }

    @Override
    public com.ticketbox.module.payment.application.gateway.PaymentQueryResult queryPayment(
            OrderView order, String requestId, String initiationPayload) {
        if (queryUrl.isBlank()) {
            return com.ticketbox.module.payment.application.gateway.PaymentQueryResult.unknown();
        }
        requireConfigured();
        try {
            var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            String transactionDate = initiationPayload == null ? "" : mapper.readTree(initiationPayload).path("vnp_CreateDate").asText();
            if (transactionDate.isBlank() && order.paymentUrl() != null) {
                String query = java.net.URI.create(order.paymentUrl()).getRawQuery();
                if (query != null) for (String part : query.split("&")) {
                    if (part.startsWith("vnp_CreateDate=")) transactionDate = part.substring("vnp_CreateDate=".length());
                }
            }
            if (transactionDate.isBlank()) return com.ticketbox.module.payment.application.gateway.PaymentQueryResult.unknown();
            Map<String, String> body = new java.util.LinkedHashMap<>();
            body.put("vnp_RequestId", UUID.randomUUID().toString().replace("-", ""));
            body.put("vnp_Version", "2.1.0"); body.put("vnp_Command", "querydr");
            body.put("vnp_TmnCode", properties.tmnCode()); body.put("vnp_TxnRef", order.id().toString());
            body.put("vnp_TransactionDate", transactionDate);
            body.put("vnp_CreateDate", LocalDateTime.now(VNPAY_ZONE).format(VNPAY_DATE_FORMAT));
            body.put("vnp_IpAddr", "127.0.0.1"); body.put("vnp_OrderInfo", "Query order " + order.id());
            body.put("vnp_SecureHash", hmacSha512(properties.hashSecret(), String.join("|", body.values())));
            var factory = new org.springframework.http.client.SimpleClientHttpRequestFactory();
            factory.setConnectTimeout(3000); factory.setReadTimeout(10000);
            String raw = org.springframework.web.client.RestClient.builder().requestFactory(factory).build().post()
                    .uri(queryUrl).contentType(org.springframework.http.MediaType.APPLICATION_JSON).body(body)
                    .retrieve().body(String.class);
            var json = mapper.readTree(raw);
            String[] fields = {"vnp_ResponseId", "vnp_Command", "vnp_ResponseCode", "vnp_Message", "vnp_TmnCode",
                    "vnp_TxnRef", "vnp_Amount", "vnp_BankCode", "vnp_PayDate", "vnp_TransactionNo",
                    "vnp_TransactionType", "vnp_TransactionStatus", "vnp_OrderInfo", "vnp_PromotionCode", "vnp_PromotionAmount"};
            String signed = java.util.Arrays.stream(fields).map(f -> json.path(f).asText(""))
                    .collect(Collectors.joining("|"));
            String expected = hmacSha512(properties.hashSecret(), signed);
            boolean verified = expected.equalsIgnoreCase(json.path("vnp_SecureHash").asText()) &&
                    order.id().toString().equals(json.path("vnp_TxnRef").asText()) &&
                    properties.tmnCode().equals(json.path("vnp_TmnCode").asText()) &&
                    "querydr".equals(json.path("vnp_Command").asText());
            boolean success = "00".equals(json.path("vnp_ResponseCode").asText()) &&
                    "00".equals(json.path("vnp_TransactionStatus").asText());
            return new com.ticketbox.module.payment.application.gateway.PaymentQueryResult(verified, success,
                    json.path("vnp_TransactionNo").asText(), fromVnpayAmount(json.path("vnp_Amount").asText()), raw,
                    "00".equals(json.path("vnp_ResponseCode").asText()) && "02".equals(json.path("vnp_TransactionStatus").asText()));
        } catch (Exception exception) {
            return com.ticketbox.module.payment.application.gateway.PaymentQueryResult.unknown();
        }
    }

    @SuppressWarnings("unused")
    private PaymentInitiationResult fallbackInitiatePayment(OrderView order, Throwable throwable) {
        if (throwable instanceof com.ticketbox.module.payment.application.gateway.GatewayNotSubmittedException notSubmitted) throw notSubmitted;
        if (throwable instanceof io.github.resilience4j.circuitbreaker.CallNotPermittedException) {
            throw new com.ticketbox.module.payment.application.gateway.GatewayNotSubmittedException("Cổng thanh toán VNPAY tạm thời không khả dụng");
        }
        throw new AppException(ErrorCode.PAYMENT_GATEWAY_UNAVAILABLE, "Cổng thanh toán VNPAY tạm thời không khả dụng");
    }

    private void requireConfigured() {
        if (isBlank(properties.payUrl())
                || isBlank(properties.returnUrl())
                || isBlank(properties.tmnCode())
                || isBlank(properties.hashSecret())) {
            throw new com.ticketbox.module.payment.application.gateway.GatewayNotSubmittedException( "Cấu hình VNPAY chưa đầy đủ");
        }
    }

    private String toVnpayAmount(BigDecimal amount) {
        return amount.multiply(BigDecimal.valueOf(100))
                .setScale(0, RoundingMode.UNNECESSARY)
                .toPlainString();
    }

    private BigDecimal fromVnpayAmount(String amount) {
        if (amount == null || amount.isBlank()) {
            return BigDecimal.ZERO;
        }
        try { return new BigDecimal(amount).divide(BigDecimal.valueOf(100), 0, RoundingMode.UNNECESSARY); }
        catch (RuntimeException exception) { return null; }
    }

    private String buildQuery(TreeMap<String, String> params) {
        return params.entrySet().stream()
                .map(entry -> encode(entry.getKey()) + "=" + encode(entry.getValue()))
                .collect(Collectors.joining("&"));
    }

    private String buildHashData(TreeMap<String, String> params) {
        return params.entrySet().stream()
                .map(entry -> entry.getKey() + "=" + encode(entry.getValue()))
                .collect(Collectors.joining("&"));
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.US_ASCII);
    }

    private String hmacSha512(String key, String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA512");
            mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA512"));
            byte[] bytes = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder hash = new StringBuilder(bytes.length * 2);
            for (byte b : bytes) {
                hash.append(String.format("%02x", b));
            }
            return hash.toString();
        } catch (Exception ex) {
            throw new AppException(ErrorCode.INTERNAL_SERVER_ERROR, "Không thể ký dữ liệu VNPAY");
        }
    }

    private String toJsonLike(Map<String, String> values) {
        try { return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(values); }
        catch (com.fasterxml.jackson.core.JsonProcessingException exception) { return "{}"; }
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
