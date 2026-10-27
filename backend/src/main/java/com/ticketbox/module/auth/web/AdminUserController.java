package com.ticketbox.module.auth.web;

import com.ticketbox.module.auth.application.AdminUserService;
import com.ticketbox.module.auth.web.dto.UpdateUserRoleRequest;
import com.ticketbox.module.auth.web.dto.UpdateUserStatusRequest;
import com.ticketbox.module.auth.web.dto.UserResponse;
import com.ticketbox.shared.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/users")
@RequiredArgsConstructor
public class AdminUserController {

    private final AdminUserService adminUserService;

    @GetMapping
    public ResponseEntity<ApiResponse<Page<UserResponse>>> listUsers(Pageable pageable) {
        Page<UserResponse> users = adminUserService.listUsers(pageable);
        return ResponseEntity.ok(ApiResponse.success(users));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<UserResponse>> getUserDetail(@PathVariable UUID id) {
        UserResponse user = adminUserService.getUserDetail(id);
        return ResponseEntity.ok(ApiResponse.success(user));
    }

    @PutMapping("/{id}/role")
    public ResponseEntity<ApiResponse<UserResponse>> updateUserRole(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateUserRoleRequest request
    ) {
        UserResponse user = adminUserService.updateUserRole(id, request.role());
        return ResponseEntity.ok(ApiResponse.success(user));
    }

    @PutMapping("/{id}/status")
    public ResponseEntity<ApiResponse<UserResponse>> updateUserStatus(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateUserStatusRequest request
    ) {
        UserResponse user = adminUserService.updateUserStatus(id, request.isActive());
        return ResponseEntity.ok(ApiResponse.success(user));
    }
}
