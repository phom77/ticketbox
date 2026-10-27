package com.ticketbox.module.admin.infrastructure.batch;

import com.ticketbox.module.admin.domain.GuestList;
import com.ticketbox.module.admin.domain.GuestListRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.batch.core.configuration.annotation.StepScope;
import org.springframework.batch.item.ItemProcessor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.OffsetDateTime;
import java.util.UUID;

@Component
@StepScope
@RequiredArgsConstructor
@Slf4j
public class GuestListProcessor implements ItemProcessor<GuestListRow, GuestList> {

    private final GuestListRepository guestListRepository;
    private final com.ticketbox.module.concert.ConcertOrderPort concertOrderPort;

    @Value("#{jobParameters['concertId']}")
    private String jobConcertId;

    @Value("#{jobParameters['fileName']}")
    private String batchFile;

    @Override
    public GuestList process(GuestListRow item) throws Exception {
        // Validate phone
        if (item.getPhone() == null || item.getPhone().trim().length() < 8) {
            throw new IllegalArgumentException("Số điện thoại không hợp lệ: " + item.getPhone());
        }

        // Validate full name
        if (!StringUtils.hasText(item.getFullName())) {
            throw new IllegalArgumentException("Họ tên không được để trống");
        }

        // Determine concert ID
        String concertIdStr = StringUtils.hasText(item.getConcertId()) ? item.getConcertId() : jobConcertId;
        if (!StringUtils.hasText(concertIdStr)) {
            throw new IllegalArgumentException("Thiếu concert ID trong dòng CSV và tham số job");
        }

        UUID concertId;
        try {
            concertId = UUID.fromString(concertIdStr.trim());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Định dạng concert ID không hợp lệ: " + concertIdStr);
        }

        // Check if concert exists
        if (concertOrderPort.findConcertById(concertId).isEmpty()) {
            throw new IllegalArgumentException("Concert không tồn tại với ID: " + concertId);
        }

        String phone = item.getPhone().trim();

        // Perform upsert logic
        return guestListRepository.findByConcertIdAndPhone(concertId, phone)
                .map(existing -> {
                    existing.setFullName(item.getFullName().trim());
                    existing.setCategory(item.getCategory() != null ? item.getCategory().trim() : null);
                    existing.setSponsorName(item.getSponsorName() != null ? item.getSponsorName().trim() : null);
                    existing.setNotes(item.getNotes() != null ? item.getNotes().trim() : null);
                    existing.setBatchFile(batchFile);
                    existing.setActive(true);
                    existing.setImportedAt(OffsetDateTime.now());
                    return existing;
                })
                .orElseGet(() -> {
                    GuestList newGuest = new GuestList();
                    newGuest.setConcertId(concertId);
                    newGuest.setPhone(phone);
                    newGuest.setFullName(item.getFullName().trim());
                    newGuest.setCategory(item.getCategory() != null ? item.getCategory().trim() : null);
                    newGuest.setSponsorName(item.getSponsorName() != null ? item.getSponsorName().trim() : null);
                    newGuest.setNotes(item.getNotes() != null ? item.getNotes().trim() : null);
                    newGuest.setBatchFile(batchFile);
                    newGuest.setActive(true);
                    newGuest.setImportedAt(OffsetDateTime.now());
                    return newGuest;
                });
    }
}
