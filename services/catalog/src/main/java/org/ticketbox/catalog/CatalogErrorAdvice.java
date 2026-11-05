package org.ticketbox.catalog;

import com.ticketbox.shared.response.ApiResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataAccessException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
public class CatalogErrorAdvice {
    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<?> saleWrite(DataAccessException failure) {
        String detail = failure.getMostSpecificCause().getMessage();
        if (detail != null && detail.contains("can be edited only while the concert is DRAFT")) {
            return ResponseEntity.status(409).body(ApiResponse.error(409,
                    "Chỉ chỉnh giá, số lượng và danh sách hạng vé khi concert ở trạng thái DRAFT"));
        }
        org.slf4j.LoggerFactory.getLogger(getClass()).error("Catalog persistence failed", failure);
        return ResponseEntity.internalServerError().body(ApiResponse.error(500, "Không thể lưu cấu hình concert"));
    }
}
