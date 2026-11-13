package org.ticketbox.identity.auth.application;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.identity.account.application.port.UserRepository;
import org.ticketbox.identity.account.domain.User;
import org.ticketbox.identity.application.error.AppException;
import org.ticketbox.identity.application.error.ErrorCode;
import org.ticketbox.identity.auth.application.port.PasswordResetStore;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

@Service
public class PasswordRecovery {
    public record Mail(UUID id, UUID leaseId, String email, String token) {}

    private static final int NONCE_BYTES = 12;
    private final SecureRandom random = new SecureRandom();
    private final UserRepository accounts;
    private final PasswordEncoder passwords;
    private final PasswordResetStore resets;
    private final SecretKeySpec encryptionKey;

    PasswordRecovery(UserRepository accounts, PasswordEncoder passwords, PasswordResetStore resets,
            @Value("${ticketbox.reset.key:}") String key) {
        this.accounts = accounts;
        this.passwords = passwords;
        this.resets = resets;
        if (!key.isBlank() && key.length() < 32) throw new IllegalArgumentException("Password reset key is too short");
        this.encryptionKey = key.isBlank() ? null : new SecretKeySpec(digest(key), "AES");
    }

    public boolean enabled() {
        return encryptionKey != null;
    }

    @Transactional
    public void request(String address, String client) {
        if (!enabled() || address == null || address.isBlank() || address.length() > 254) return;
        String email = address.strip().toLowerCase(Locale.ROOT);
        long bucket = bucket();
        if (!resets.allow("CLIENT", digest(client), bucket, 30)
                || !resets.allow("EMAIL", digest(email), bucket, 5)) return;

        var matches = accounts.findTop2ByEmailIgnoreCase(email);
        if (matches.size() != 1) return;
        accounts.findByIdForUpdate(matches.getFirst().getId()).filter(PasswordRecovery::eligible).ifPresent(account -> {
            byte[] secret = new byte[32];
            random.nextBytes(secret);
            String token = Base64.getUrlEncoder().withoutPadding().encodeToString(secret);
            UUID id = UUID.randomUUID();
            resets.issue(account.getId(), id, account.getSessionVersion(), digest(token), encrypt(id, token));
        });
    }

    @Transactional
    public void confirm(String token, String password) {
        if (!enabled() || token == null || !token.matches("[A-Za-z0-9_-]{43}")
                || password == null || password.length() < 8 || password.isBlank()
                || password.getBytes(StandardCharsets.UTF_8).length > 72) throw invalid();
        byte[] digest = digest(token);
        User account = resets.findAccount(digest).flatMap(accounts::findByIdForUpdate)
                .filter(PasswordRecovery::eligible).orElseThrow(PasswordRecovery::invalid);
        if (!resets.consume(account.getId(), account.getSessionVersion(), digest)) throw invalid();
        account.resetPassword(passwords.encode(password));
    }

    @Transactional
    public Optional<Mail> claim() {
        if (!enabled()) return Optional.empty();
        return resets.claim(UUID.randomUUID(), bucket()).map(delivery -> new Mail(delivery.id(), delivery.leaseId(),
                delivery.email(), decrypt(delivery.id(), delivery.encryptedToken())));
    }

    @Transactional
    public void finish(UUID id, UUID leaseId, boolean delivered) {
        resets.finish(id, leaseId, delivered);
    }

    private byte[] encrypt(UUID id, String token) {
        byte[] nonce = new byte[NONCE_BYTES];
        random.nextBytes(nonce);
        byte[] encrypted = crypt(Cipher.ENCRYPT_MODE, id, nonce, token.getBytes(StandardCharsets.UTF_8));
        return ByteBuffer.allocate(nonce.length + encrypted.length).put(nonce).put(encrypted).array();
    }

    private String decrypt(UUID id, byte[] value) {
        var bytes = ByteBuffer.wrap(value);
        byte[] nonce = new byte[NONCE_BYTES];
        bytes.get(nonce);
        byte[] encrypted = new byte[bytes.remaining()];
        bytes.get(encrypted);
        return new String(crypt(Cipher.DECRYPT_MODE, id, nonce, encrypted), StandardCharsets.UTF_8);
    }

    private byte[] crypt(int mode, UUID id, byte[] nonce, byte[] value) {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(mode, encryptionKey, new GCMParameterSpec(128, nonce));
            cipher.updateAAD(id.toString().getBytes(StandardCharsets.US_ASCII));
            return cipher.doFinal(value);
        } catch (GeneralSecurityException failure) {
            throw new IllegalStateException("Password reset encryption failed", failure);
        }
    }

    private static byte[] digest(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException failure) {
            throw new IllegalStateException(failure);
        }
    }

    private static long bucket() {
        return Instant.now().getEpochSecond() / 900;
    }

    private static boolean eligible(User account) {
        return account.isActive() && account.getRole() == User.Role.AUDIENCE;
    }

    private static AppException invalid() {
        return new AppException(ErrorCode.INVALID_REQUEST, "error.auth.invalid-reset");
    }
}
