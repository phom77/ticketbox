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
                throw new AppException(ErrorCode.INVALID_REQUEST, "error.artist-bio.pdf-encrypted");
            }
            int pages = document.getNumberOfPages();
            if (pages > properties.getMaxPages()) {
                throw new AppException(
                        ErrorCode.INVALID_REQUEST, "error.artist-bio.pdf-too-many-pages");
            }
            String text = new PDFTextStripper().getText(document);
            if (text == null || text.isBlank()) {
                throw new AppException(ErrorCode.INVALID_REQUEST, "error.artist-bio.pdf-no-text");
            }
            return new ExtractedPdf(text, pages);
        } catch (AppException ex) {
            throw ex;
        } catch (IOException ex) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.artist-bio.pdf-read-failed");
        }
    }
}
