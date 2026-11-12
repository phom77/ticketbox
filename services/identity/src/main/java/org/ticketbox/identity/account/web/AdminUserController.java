package org.ticketbox.identity.account.web;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.*;
import org.ticketbox.identity.account.application.AdminUserService;
import org.ticketbox.identity.account.application.dto.UpdateUserRoleRequest;
import org.ticketbox.identity.account.application.dto.UpdateUserStatusRequest;
import org.ticketbox.identity.account.application.dto.UserResponse;
import org.ticketbox.identity.web.ApiResponse;
import org.ticketbox.identity.web.security.SessionAccess;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/users")
@RequiredArgsConstructor
public class AdminUserController {

    private final AdminUserService adminUserService;
    private final SessionAccess sessions;

    @GetMapping
    public ResponseEntity<ApiResponse<Page<UserResponse>>> listUsers(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, Pageable pageable) {
        sessions.requirePlatformAdmin(authorization);
        Page<UserResponse> users = adminUserService.listUsers(pageable);
        return ResponseEntity.ok(ApiResponse.success(users));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<UserResponse>> getUserDetail(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID id) {
        sessions.requirePlatformAdmin(authorization);
        UserResponse user = adminUserService.getUserDetail(id);
        return ResponseEntity.ok(ApiResponse.success(user));
    }

    @PutMapping("/{id}/role")
    public ResponseEntity<ApiResponse<UserResponse>> updateUserRole(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @PathVariable UUID id, @Valid @RequestBody UpdateUserRoleRequest request) {
        UserResponse user = adminUserService.updateUserRole(
                sessions.requirePlatformAdmin(authorization), id, request.role());
        return ResponseEntity.ok(ApiResponse.success(user));
    }

    @PutMapping("/{id}/status")
    public ResponseEntity<ApiResponse<UserResponse>> updateUserStatus(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @PathVariable UUID id, @Valid @RequestBody UpdateUserStatusRequest request) {
        UserResponse user = adminUserService.updateUserStatus(
                sessions.requirePlatformAdmin(authorization), id, request.isActive());
        return ResponseEntity.ok(ApiResponse.success(user));
    }
}
