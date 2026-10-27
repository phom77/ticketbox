package com.ticketbox.module.ai.infrastructure;

import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import java.io.IOException;
import java.nio.file.Path;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Component;

@Component
public class PdfBoxTextExtractor {

    private final AiProperties properties;

    public PdfBoxTextExtractor(AiProperties properties) {
        this.properties = properties;
    }

    public ExtractedPdf extract(Path path) {
        try (PDDocument document = Loader.loadPDF(path.toFile())) {
            if (document.isEncrypted()) {
                throw new AppException(
                        ErrorCode.INVALID_REQUEST,
                        "Không hỗ trợ PDF được mã hóa");
            }
            int pages = document.getNumberOfPages();
            if (pages > properties.getMaxPages()) {
                throw new AppException(
                        ErrorCode.INVALID_REQUEST,
                        "PDF vượt quá số trang tối đa");
            }
            String text = new PDFTextStripper().getText(document);
            if (text == null || text.isBlank()) {
                throw new AppException(
                        ErrorCode.INVALID_REQUEST,
                        "PDF không có văn bản trích xuất được; chưa hỗ trợ PDF dạng scan");
            }
            return new ExtractedPdf(text, pages);
        } catch (AppException ex) {
            throw ex;
        } catch (IOException ex) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "Không thể đọc nội dung PDF");
        }
    }
}
