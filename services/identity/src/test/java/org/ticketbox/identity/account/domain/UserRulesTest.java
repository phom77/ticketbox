package org.ticketbox.identity.account.domain;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class UserRulesTest {
    @Test
    void registrationAlwaysCreatesAnActiveAudienceAccount() {
        User user = User.register("buyer@example.test", "Buyer", "encoded-password", null);
        assertEquals(User.Role.AUDIENCE, user.getRole());
        assertTrue(user.isActive());
        user.changeActivity(false);
        assertFalse(user.isActive());
        assertThrows(NullPointerException.class, () -> user.changeRole(null));
    }
}
