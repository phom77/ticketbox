package org.ticketbox.catalog.support;

import org.springframework.mock.web.MockMultipartFile;
import org.ticketbox.catalog.application.port.Upload;

public class TestUpload extends MockMultipartFile implements Upload {
    public TestUpload(String name, String originalFilename, String contentType, byte[] content) {
        super(name, originalFilename, contentType, content);
    }
}
