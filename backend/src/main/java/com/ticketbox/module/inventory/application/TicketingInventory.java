package com.ticketbox.module.inventory.application;

import com.ticketbox.module.inventory.InventoryPort;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional
public class TicketingInventory implements InventoryPort {
    private final JdbcTemplate jdbc;

    @Override @Transactional(readOnly = true)
    public int available(UUID id) {
        return jdbc.queryForObject("SELECT available_qty FROM ticket_inventory WHERE ticket_type_id=?", Integer.class, id);
    }
    @Override public boolean reserve(UUID id, int quantity) {
        positive(quantity);
        return jdbc.update("UPDATE ticket_inventory SET available_qty=available_qty-?, updated_at=now() WHERE ticket_type_id=? AND active AND available_qty>=?",
                quantity, id, quantity) == 1;
    }
    @Override public void release(UUID id, int quantity) {
        positive(quantity);
        if (jdbc.update("UPDATE ticket_inventory SET available_qty=available_qty+?, updated_at=now() WHERE ticket_type_id=? AND available_qty+?<=total_quantity",
                quantity, id, quantity) != 1) throw new IllegalStateException("Stock release exceeds allocation or SKU is missing");
    }
    @Override public void resizePristine(UUID id, int total) {
        positive(total);
        if (jdbc.update("UPDATE ticket_inventory SET total_quantity=?, available_qty=?, revision=revision+1, updated_at=now() WHERE ticket_type_id=? AND available_qty=total_quantity",
                total, total, id) != 1) throw new AppException(ErrorCode.INVALID_REQUEST, "Không thể chỉnh sửa tồn kho đã được phân bổ");
    }
    @Override public void setActive(UUID id, boolean active) {
        if (jdbc.update("UPDATE ticket_inventory SET active=?, revision=revision+1, updated_at=now() WHERE ticket_type_id=?", active, id) != 1)
            throw new AppException(ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy tồn kho");
    }
    private void positive(int quantity) {
        if (quantity <= 0) throw new AppException(ErrorCode.INVALID_REQUEST, "Số lượng phải lớn hơn 0");
    }
}
