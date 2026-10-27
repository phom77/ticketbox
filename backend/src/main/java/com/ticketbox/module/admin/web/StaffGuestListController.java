package com.ticketbox.module.admin.web;

import com.ticketbox.module.admin.application.GuestListService;
import com.ticketbox.module.admin.web.dto.GuestLookupResponse;
import com.ticketbox.module.admin.web.dto.GuestCheckinRequest;
import com.ticketbox.shared.response.ApiResponse;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.security.core.Authentication;
import jakarta.validation.Valid;

import java.util.UUID;

@RestController
@RequestMapping("/api/staff/guestlist")
@RequiredArgsConstructor
@Validated
public class StaffGuestListController {

    private final GuestListService guestListService;

    @GetMapping
    public ApiResponse<GuestLookupResponse> findGuest(
            @RequestParam(name = "concert_id") UUID concertId,
            @RequestParam @NotBlank String phone
    ) {
        return ApiResponse.success(guestListService.findActiveGuest(concertId, phone));
    }

    @GetMapping("/list")
    public ApiResponse<java.util.List<GuestLookupResponse>> getGuestList(
            @RequestParam(name = "concert_id") UUID concertId
    ) {
        java.util.List<GuestLookupResponse> list = guestListService.getGuestListByConcertId(concertId).stream()
                .map(g -> new GuestLookupResponse(
                        true, g.getId(), g.getConcertId(), g.getPhone(),
                        g.getFullName(), g.getCategory(), g.getSponsorName(), g.getNotes(),
                        g.getCheckedInAt(), g.getCheckinGate()))
                .toList();
        return ApiResponse.success(list);
    }

    @PostMapping("/{guestId}/check-in")
    public ApiResponse<GuestLookupResponse> checkIn(
            @PathVariable UUID guestId,
            @Valid @RequestBody GuestCheckinRequest request,
            Authentication authentication) {
        return ApiResponse.success(guestListService.checkIn(
                guestId,
                request.concertId(),
                UUID.fromString(authentication.getName()),
                request.gate()));
    }
}
