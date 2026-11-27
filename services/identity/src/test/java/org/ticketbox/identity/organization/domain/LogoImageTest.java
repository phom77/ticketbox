package org.ticketbox.identity.organization.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import javax.imageio.ImageIO;

class LogoImageTest {
    private static byte[] encode(int w, int h, String format) throws Exception {
        var out = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB), format, out);
        return out.toByteArray();
    }

    @Test
    void acceptsPngAndJpegOfEnoughPixels() throws Exception {
        assertThat(LogoImage.check(encode(128, 128, "png"), "image/png")).isNull();
        assertThat(LogoImage.check(encode(300, 200, "jpg"), "image/jpeg")).isNull();
    }

    @Test
    void rejectsSmallMismatchedAndUnsupportedImages() throws Exception {
        assertThat(LogoImage.check(encode(127, 300, "png"), "image/png")).isEqualTo(LogoImage.Problem.TOO_SMALL);
        assertThat(LogoImage.check(encode(64, 64, "jpg"), "image/jpeg")).isEqualTo(LogoImage.Problem.TOO_SMALL);
        assertThat(LogoImage.check(encode(200, 200, "png"), "image/jpeg")).isEqualTo(LogoImage.Problem.TYPE_MISMATCH);
        assertThat(LogoImage.check("GIF89a".getBytes(), "image/gif")).isEqualTo(LogoImage.Problem.UNSUPPORTED_TYPE);
        assertThat(LogoImage.check(new byte[0], "image/png")).isEqualTo(LogoImage.Problem.EMPTY);
        assertThat(LogoImage.check(new byte[LogoImage.MAX_BYTES + 1], "image/png")).isEqualTo(LogoImage.Problem.TOO_LARGE);
    }

    @Test
    void readsWebpDimensions() {
        byte[] webp = new byte[40];
        System.arraycopy("RIFF".getBytes(), 0, webp, 0, 4);
        System.arraycopy("WEBPVP8X".getBytes(), 0, webp, 8, 8);
        webp[24] = (byte) 255; // width - 1 = 255
        webp[27] = (byte) 199; // height - 1 = 199
        assertThat(LogoImage.check(webp, "image/webp")).isNull();
        webp[27] = 10;
        assertThat(LogoImage.check(webp, "image/webp")).isEqualTo(LogoImage.Problem.TOO_SMALL);
    }

    @Test
    void buildsAPngRenditionOnlyForCloudinaryUrls() {
        var withLogo = OrganizationProfile.empty(java.util.UUID.randomUUID())
                .withLogo("https://res.cloudinary.com/demo/image/upload/v1/a.webp", "a");
        assertThat(withLogo.logoPngUrl()).isEqualTo("https://res.cloudinary.com/demo/image/upload/f_png,w_400,c_limit/v1/a.webp");
        assertThat(OrganizationProfile.empty(java.util.UUID.randomUUID()).withLogo("https://evil.test/x.png", "x").logoPngUrl()).isNull();
    }
}
