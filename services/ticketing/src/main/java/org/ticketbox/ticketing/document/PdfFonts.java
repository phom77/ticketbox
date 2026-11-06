package org.ticketbox.ticketing.document;

import com.lowagie.text.DocumentException;
import com.lowagie.text.pdf.BaseFont;

import java.io.IOException;

public final class PdfFonts {
    private PdfFonts() {}

    public static BaseFont notoSans() throws DocumentException, IOException {
        return BaseFont.createFont("fonts/NotoSans-Regular.ttf", BaseFont.IDENTITY_H, BaseFont.EMBEDDED);
    }
}
