package com.ticketbox.module.queue.web;

import com.ticketbox.module.queue.application.WaitingRoomService;
import com.ticketbox.module.queue.web.dto.QueueStatusResponse;
import com.ticketbox.shared.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/queue/concerts/{concertId}")
@RequiredArgsConstructor
public class WaitingRoomController {

    private final WaitingRoomService waitingRoomService;

    @PostMapping("/join")
    public ResponseEntity<ApiResponse<QueueStatusResponse>> join(
            @PathVariable UUID concertId,
            Authentication authentication
    ) {
        UUID userId = UUID.fromString(authentication.getName());
        return ResponseEntity.ok(ApiResponse.success(waitingRoomService.join(concertId, userId)));
    }

    @GetMapping("/status")
    public ResponseEntity<ApiResponse<QueueStatusResponse>> status(
            @PathVariable UUID concertId,
            Authentication authentication
    ) {
        UUID userId = UUID.fromString(authentication.getName());
        return ResponseEntity.ok(ApiResponse.success(waitingRoomService.status(concertId, userId)));
    }

    @PostMapping("/leave")
    public ResponseEntity<ApiResponse<QueueStatusResponse>> leave(
            @PathVariable UUID concertId,
            Authentication authentication
    ) {
        UUID userId = UUID.fromString(authentication.getName());
        return ResponseEntity.ok(ApiResponse.success(waitingRoomService.leave(concertId, userId)));
    }
}
