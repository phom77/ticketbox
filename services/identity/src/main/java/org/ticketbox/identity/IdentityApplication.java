package org.ticketbox.identity;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.context.annotation.Import;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.ticketbox.split.SplitCommon;

@SpringBootApplication(scanBasePackages = {"org.ticketbox.identity", "com.ticketbox.module.auth"})
@EntityScan("com.ticketbox.module.auth.domain")
@EnableJpaRepositories("com.ticketbox.module.auth.domain")
@Import(SplitCommon.class)
public class IdentityApplication {
    public static void main(String[] args) {
        SpringApplication.run(IdentityApplication.class, args);
    }
}
