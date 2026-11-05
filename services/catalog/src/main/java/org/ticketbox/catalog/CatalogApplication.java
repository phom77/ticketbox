package org.ticketbox.catalog;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.context.annotation.Import;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.scheduling.annotation.*;
import org.ticketbox.split.SplitCommon;
import com.ticketbox.infrastructure.redis.*;

@SpringBootApplication(scanBasePackages = {"org.ticketbox.catalog","com.ticketbox.module.concert","com.ticketbox.module.ai"})
@EntityScan({"org.springframework.modulith.events.jpa","com.ticketbox.module.concert.domain","com.ticketbox.module.ai.domain"})
@EnableJpaRepositories({"com.ticketbox.module.concert.domain","com.ticketbox.module.ai.domain"})
@ConfigurationPropertiesScan({"com.ticketbox.module.ai","com.ticketbox.module.concert.infrastructure"})
@EnableScheduling
@EnableAsync
@Import({SplitCommon.class, RedisConfig.class, RedisReadCache.class})
public class CatalogApplication {
    public static void main(String[] args) {
        SpringApplication.run(CatalogApplication.class, args);
    }
}
