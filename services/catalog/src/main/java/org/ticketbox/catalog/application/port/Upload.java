package org.ticketbox.catalog.application.port;

import java.io.IOException;
import java.io.InputStream;

public interface Upload {
    String getOriginalFilename();

    String getContentType();

    long getSize();

    boolean isEmpty();

    InputStream getInputStream() throws IOException;

    byte[] getBytes() throws IOException;
}
