package org.ticketbox.checkin.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.unit.DataSize;

import java.time.Duration;

@ConfigurationProperties(prefix = "ticketbox.guest-list")
public class GuestListImportProperties
        implements org.ticketbox.checkin.guestlist.application.port.GuestListLimits {

    private String rootDir = "./data/guest-list";
    private String cron = "0 0 3 * * *";
    private DataSize maxFileSize = DataSize.ofMegabytes(10);
    private Duration stableAge = Duration.ofSeconds(30);

    public String getRootDir() {
        return rootDir;
    }

    public void setRootDir(String rootDir) {
        this.rootDir = rootDir;
    }

    public String getCron() {
        return cron;
    }

    public void setCron(String cron) {
        this.cron = cron;
    }

    public DataSize getMaxFileSize() {
        return maxFileSize;
    }

    public void setMaxFileSize(DataSize maxFileSize) {
        this.maxFileSize = maxFileSize;
    }

    public Duration getStableAge() {
        return stableAge;
    }

    public void setStableAge(Duration stableAge) {
        this.stableAge = stableAge;
    }
}
