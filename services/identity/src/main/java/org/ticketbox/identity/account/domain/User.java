package org.ticketbox.identity.account.domain;

import lombok.Getter;
import lombok.NoArgsConstructor;

import org.ticketbox.identity.domain.BaseEntity;

@Getter
@NoArgsConstructor
public class User extends BaseEntity {

    public enum Role {
        AUDIENCE,
        ORGANIZER,
        STAFF,
        ADMIN
    }

    private String email;

    private String phone;

    private String fullName;

    private String passwordHash;

    private Role role = Role.AUDIENCE;

    private boolean isActive = true;

    private long sessionVersion;

    public void setActive(boolean active) {
        isActive = active;
    }

    public void setRole(Role role) {
        this.role = role;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public void setFullName(String fullName) {
        this.fullName = fullName;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public static User register(String email, String fullName, String passwordHash, String phone) {
        User user = new User();
        user.email = java.util.Objects.requireNonNull(email);
        user.fullName = java.util.Objects.requireNonNull(fullName);
        user.passwordHash = java.util.Objects.requireNonNull(passwordHash);
        user.phone = phone;
        user.role = Role.AUDIENCE;
        user.isActive = true;
        return user;
    }

    public void changeRole(Role role) {
        java.util.Objects.requireNonNull(role);
        if (this.role != role) {
            this.role = role;
            sessionVersion++;
        }
    }

    public void changeActivity(boolean active) {
        if (isActive != active) {
            isActive = active;
            sessionVersion++;
        }
    }

    public void updateProfile(String name, String phone) {
        if (name != null) fullName = name.trim();
        if (phone != null) this.phone = phone.trim();
    }
}
