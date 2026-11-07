package org.ticketbox.catalog.artistbio.infrastructure;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Component;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.application.error.ErrorCode;
import org.ticketbox.catalog.artistbio.application.port.ExtractedPdf;
import org.ticketbox.catalog.config.AiProperties;

import java.io.IOException;
import java.nio.file.Path;

@Component
public class PdfBoxTextExtractor
        implements org.ticketbox.catalog.artistbio.application.port.PdfTextReader {

    private final AiProperties properties;

    public PdfBoxTextExtractor(AiProperties properties) {
        this.properties = properties;
    }

    public ExtractedPdf extract(Path path) {
        try (PDDocument document = Loader.loadPDF(path.toFile())) {
            if (document.isEncrypted()) {
                throw new AppException(ErrorCode.INVALID_REQUEST, "Không hỗ trợ PDF được mã hóa");
            }
            int pages = document.getNumberOfPages();
            if (pages > properties.getMaxPages()) {
                throw new AppException(ErrorCode.INVALID_REQUEST, "PDF vượt quá số trang tối đa");
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
