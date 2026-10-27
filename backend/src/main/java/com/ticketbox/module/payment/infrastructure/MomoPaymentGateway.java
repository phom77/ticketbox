package com.ticketbox.module.payment.infrastructure;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ticketbox.module.payment.application.gateway.PaymentGateway;
import com.ticketbox.module.payment.application.gateway.PaymentInitiationResult;
import com.ticketbox.module.payment.application.gateway.PaymentWebhookResult;
import com.ticketbox.module.payment.domain.PaymentLog;
import com.ticketbox.module.ticket.OrderView;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import com.ticketbox.module.payment.application.gateway.PaymentQueryResult;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Component
public class MomoPaymentGateway implements PaymentGateway {

    // Final payment failures only; system/merchant/pending codes cannot prove that money will not arrive.
    private static final java.util.Set<String> FINAL_FAILURE_CODES = java.util.Set.of(
            "98","99","1001","1002","1003","1004","1005","1006","1007","1017","1026","4001","4002","4100");
    private final MomoProperties properties;
    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final RestClient queryClient;

    public MomoPaymentGateway(MomoProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        SimpleClientHttpRequestFactory creates = new SimpleClientHttpRequestFactory();
        creates.setConnectTimeout(3000); creates.setReadTimeout(10000);
        this.restClient = RestClient.builder().requestFactory(creates).build();
        SimpleClientHttpRequestFactory queries = new SimpleClientHttpRequestFactory();
        queries.setConnectTimeout(3000); queries.setReadTimeout(30000);
        this.queryClient = RestClient.builder().requestFactory(queries).build();
        this.objectMapper = objectMapper;
    }

    @Override
    public PaymentLog.Provider provider() {
        return PaymentLog.Provider.MOMO;
    }

    @Override
    @CircuitBreaker(name = "momo", fallbackMethod = "fallbackInitiatePayment")
    public PaymentInitiationResult initiatePayment(OrderView order) {
        return initiatePayment(order, order.id().toString());
    }

    @Override
    @CircuitBreaker(name = "momo", fallbackMethod = "fallbackInitiatePayment")
    public PaymentInitiationResult initiatePayment(OrderView order, String requestId) {
        requireConfigured();
        String orderId    = order.id().toString();
        String orderInfo  = "Thanh toan ve TicketBox " + orderId;
        String amount     = order.totalAmount().setScale(0).toPlainString();
        String extraData  = "";
        String requestType = "payWithMethod";

        // Build rawSignature – fields phải đúng thứ tự alphabet theo docs MoMo
        String rawSignature = "accessKey="   + properties.accessKey()
                + "&amount="      + amount
                + "&extraData="   + extraData
                + "&ipnUrl="      + properties.ipnUrl()
                + "&orderId="     + orderId
                + "&orderInfo="   + orderInfo
                + "&partnerCode=" + properties.partnerCode()
                + "&redirectUrl=" + properties.returnUrl()
                + "&requestId="   + requestId
                + "&requestType=" + requestType;

        String signature = hmacSha256(properties.secretKey(), rawSignature);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("partnerCode", properties.partnerCode());
        body.put("partnerName", "TicketBox");
        body.put("storeId",     "TicketBoxStore");
        body.put("requestId",   requestId);
        body.put("amount",      Long.parseLong(amount));
        body.put("orderId",     orderId);
        body.put("orderInfo",   orderInfo);
        body.put("redirectUrl", properties.returnUrl());
        body.put("ipnUrl",      properties.ipnUrl());
        body.put("lang",        "vi");
        body.put("requestType", requestType);
        body.put("autoCapture", true);
        body.put("extraData",   extraData);
        body.put("signature",   signature);

        try {
            String responseBody = restClient.post()
                    .uri(properties.apiEndpointOrDefault())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(String.class);

            JsonNode json = objectMapper.readTree(responseBody);
            String payUrl = json.path("payUrl").asText();

            if (payUrl == null || payUrl.isBlank()) {
                String message = json.path("message").asText("MoMo không trả về payUrl");
                throw new AppException(ErrorCode.PAYMENT_GATEWAY_UNAVAILABLE, "Lỗi MoMo: " + message);
            }

            return new PaymentInitiationResult(provider(), payUrl, requestId, responseBody);

        } catch (AppException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new AppException(ErrorCode.PAYMENT_GATEWAY_UNAVAILABLE,
                    "Không thể khởi tạo thanh toán MoMo: " + ex.getMessage());
        }
    }

    @Override
    public PaymentWebhookResult verifyWebhook(Map<String, String> params) {
        requireConfigured();

        String rawPayload = toJsonLike(params);
        String receivedSignature = params.get("signature");

        if (receivedSignature == null || receivedSignature.isBlank()) {
            return PaymentWebhookResult.invalid("Missing MoMo signature", rawPayload);
        }

        // Build rawSignature để verify – đúng thứ tự alphabet theo docs MoMo IPN
        String rawSignature = "accessKey="   + properties.accessKey()
                + "&amount="      + params.getOrDefault("amount", "")
                + "&extraData="   + params.getOrDefault("extraData", "")
                + "&message="     + params.getOrDefault("message", "")
                + "&orderId="     + params.getOrDefault("orderId", "")
                + "&orderInfo="   + params.getOrDefault("orderInfo", "")
                + "&orderType="   + params.getOrDefault("orderType", "")
                + "&partnerCode=" + params.getOrDefault("partnerCode", "")
                + "&payType="     + params.getOrDefault("payType", "")
                + "&requestId="   + params.getOrDefault("requestId", "")
                + "&responseTime=" + params.getOrDefault("responseTime", "")
                + "&resultCode="  + params.getOrDefault("resultCode", "")
                + "&transId="     + params.getOrDefault("transId", "");

        String expectedSignature = hmacSha256(properties.secretKey(), rawSignature);

        if (!properties.partnerCode().equals(params.get("partnerCode")) ||
                !java.security.MessageDigest.isEqual(expectedSignature.toLowerCase(java.util.Locale.ROOT).getBytes(StandardCharsets.US_ASCII),
                        receivedSignature.toLowerCase(java.util.Locale.ROOT).getBytes(StandardCharsets.US_ASCII))) {
            return PaymentWebhookResult.invalid("Invalid MoMo signature", rawPayload);
        }

        UUID orderId;
        try {
            orderId = UUID.fromString(params.get("orderId"));
        } catch (RuntimeException ex) {
            return PaymentWebhookResult.invalid("Invalid MoMo order reference", rawPayload);
        }

        // This adapter always initiates one-step payments with autoCapture=true.
        boolean success = "0".equals(params.get("resultCode")) || "9000".equals(params.get("resultCode"));
        boolean pending = !success && !FINAL_FAILURE_CODES.contains(params.getOrDefault("resultCode", ""));
        String providerRef = params.getOrDefault("transId", params.getOrDefault("requestId", ""));
        BigDecimal amount = parseMomoAmount(params.get("amount"));

        return new PaymentWebhookResult(true, success, orderId, providerRef, amount, rawPayload, null, pending);
    }

    @Override
    public PaymentQueryResult queryPayment(OrderView order, String requestId, String initiationPayload) {
        requireConfigured();
        String queryId = UUID.randomUUID().toString();
        String signature = hmacSha256(properties.secretKey(), "accessKey=" + properties.accessKey()
                + "&orderId=" + order.id() + "&partnerCode=" + properties.partnerCode() + "&requestId=" + queryId);
        String raw = queryClient.post().uri(properties.apiEndpointOrDefault().replaceAll("/create$", "/query"))
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("partnerCode", properties.partnerCode(),
                        "orderId", order.id().toString(), "requestId", queryId, "lang", "vi", "signature", signature))
                .retrieve().body(String.class);
        try {
            JsonNode json = objectMapper.readTree(raw);
            // Query is authenticated with a signed request over TLS; MoMo query responses have no signature field.
            boolean verified = order.id().toString().equals(json.path("orderId").asText()) &&
                    queryId.equals(json.path("requestId").asText()) &&
                    properties.partnerCode().equals(json.path("partnerCode").asText());
            String code = json.path("resultCode").asText();
            boolean success = ("0".equals(code) || "9000".equals(code)) && json.path("transId").asLong(0) > 0;
            return new PaymentQueryResult(verified, success, json.path("transId").asText(),
                    new BigDecimal(json.path("amount").asText("0")), raw, FINAL_FAILURE_CODES.contains(code));
        } catch (Exception exception) { return PaymentQueryResult.unknown(); }
    }

    @SuppressWarnings("unused")
    private PaymentInitiationResult fallbackInitiatePayment(OrderView order, String requestId, Throwable throwable) {
        if (throwable instanceof com.ticketbox.module.payment.application.gateway.GatewayNotSubmittedException notSubmitted) throw notSubmitted;
        if (throwable instanceof io.github.resilience4j.circuitbreaker.CallNotPermittedException) {
            throw new com.ticketbox.module.payment.application.gateway.GatewayNotSubmittedException("Cổng thanh toán MoMo tạm thời không khả dụng");
        }
        throw new AppException(ErrorCode.PAYMENT_GATEWAY_UNAVAILABLE,
                "Cổng thanh toán MoMo tạm thời không khả dụng");
    }

    @SuppressWarnings("unused")
    private PaymentInitiationResult fallbackInitiatePayment(OrderView order, Throwable throwable) {
        if (throwable instanceof com.ticketbox.module.payment.application.gateway.GatewayNotSubmittedException notSubmitted) throw notSubmitted;
        if (throwable instanceof io.github.resilience4j.circuitbreaker.CallNotPermittedException) {
            throw new com.ticketbox.module.payment.application.gateway.GatewayNotSubmittedException("Cổng thanh toán MoMo tạm thời không khả dụng");
        }
        throw new AppException(ErrorCode.PAYMENT_GATEWAY_UNAVAILABLE,
                "Cổng thanh toán MoMo tạm thời không khả dụng");
    }

    private void requireConfigured() {
        if (isBlank(properties.partnerCode())
                || isBlank(properties.accessKey())
                || isBlank(properties.secretKey())
                || isBlank(properties.returnUrl())
                || isBlank(properties.ipnUrl())) {
            throw new com.ticketbox.module.payment.application.gateway.GatewayNotSubmittedException(
                    "Cấu hình MoMo chưa đầy đủ");
        }
    }

    private String hmacSha256(String key, String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] bytes = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder hash = new StringBuilder(bytes.length * 2);
            for (byte b : bytes) {
                hash.append(String.format("%02x", b));
            }
            return hash.toString();
        } catch (Exception ex) {
            throw new AppException(ErrorCode.INTERNAL_SERVER_ERROR, "Không thể ký dữ liệu MoMo");
        }
    }

    private BigDecimal parseMomoAmount(String amount) {
        if (amount == null || amount.isBlank()) return BigDecimal.ZERO;
        try {
            return new BigDecimal(amount);
        } catch (NumberFormatException ex) {
            return BigDecimal.ZERO;
        }
    }

    private String toJsonLike(Map<String, String> values) {
        try { return objectMapper.writeValueAsString(values); }
        catch (com.fasterxml.jackson.core.JsonProcessingException exception) { return "{}"; }
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
