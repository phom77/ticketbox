package org.ticketbox.checkin.web;

import org.springframework.web.multipart.MultipartFile;
import org.ticketbox.checkin.application.port.Upload;

import java.io.IOException;
import java.io.InputStream;

public record MultipartUpload(MultipartFile file) implements Upload {
    public String getOriginalFilename() {
        return file.getOriginalFilename();
    }

    public String getContentType() {
        return file.getContentType();
    }

    public long getSize() {
        return file.getSize();
    }

    public boolean isEmpty() {
        return file.isEmpty();
    }

    public InputStream getInputStream() throws IOException {
        return file.getInputStream();
    }

    public byte[] getBytes() throws IOException {
        return file.getBytes();
    }
}
