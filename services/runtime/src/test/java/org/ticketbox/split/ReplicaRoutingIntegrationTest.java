package org.ticketbox.split;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.*;
import org.springframework.core.env.MapPropertySource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.*;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.*;
import javax.sql.DataSource;
import java.util.Map;
import static org.assertj.core.api.Assertions.*;

@Testcontainers
class ReplicaRoutingIntegrationTest {
    @Container static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Configuration(proxyBeanMethods=false)
    @EnableTransactionManagement
    @EnableAspectJAutoProxy
    @Import(ReplicaDataSourceConfiguration.class)
    static class Config {
        @Bean PlatformTransactionManager transactionManager(DataSource ds) { return new DataSourceTransactionManager(ds); }
        @Bean JdbcTemplate jdbc(DataSource ds) { return new JdbcTemplate(ds); }
        @Bean Queries queries(JdbcTemplate jdbc) { return new Queries(jdbc); }
    }
    static class Queries {
        final JdbcTemplate jdbc;
        Queries(JdbcTemplate jdbc) { this.jdbc=jdbc; }
        @ReplicaRead @Transactional(readOnly=true)
        public String history() { return location(); }
        @Transactional(readOnly=true)
        public String checkoutRecovery() { return location(); }
        @Transactional
        public String checkout() { jdbc.update("INSERT INTO marker VALUES('checkout')"); return location(); }
        @ReplicaRead @Transactional
        public String incorrectlyAnnotatedWrite() { jdbc.update("INSERT INTO marker VALUES('write')"); return location(); }
        @ReplicaRead @Transactional(readOnly=true)
        public void failRead() { throw new IllegalStateException("read failed"); }
        String location() { return jdbc.queryForObject("SELECT current_database()",String.class); }
    }

    @Test void onlyExplicitReadOnlyQueriesUseReplicaAndFailureDoesNotLeakRouting() {
        var admin = new JdbcTemplate(new org.springframework.jdbc.datasource.DriverManagerDataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword()));
        admin.execute("CREATE DATABASE replica");
        admin.execute("CREATE TABLE marker(value text)");
        String replicaUrl=postgres.getJdbcUrl().replace("/test","/replica");
        try(var context=new AnnotationConfigApplicationContext()) {
            context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("test",Map.of(
                    "lab.replica.enabled","true", "spring.datasource.url",postgres.getJdbcUrl(),
                    "spring.datasource.username",postgres.getUsername(),"spring.datasource.password",postgres.getPassword(),
                    "lab.replica.url",replicaUrl)));
            context.register(Config.class); context.refresh();
            var queries=context.getBean(Queries.class);
            assertThat(queries.history()).isEqualTo("replica");
            assertThat(queries.checkoutRecovery()).isEqualTo("test");
            assertThat(queries.checkout()).isEqualTo("test");
            assertThat(queries.incorrectlyAnnotatedWrite()).isEqualTo("test");
            assertThatThrownBy(queries::failRead).hasMessage("read failed");
            assertThat(queries.checkoutRecovery()).isEqualTo("test");
            var outer=new org.springframework.transaction.support.TransactionTemplate(context.getBean(PlatformTransactionManager.class));
            outer.executeWithoutResult(tx -> assertThat(queries.history()).isEqualTo("test"));
            assertThat(admin.queryForObject("SELECT count(*) FROM marker",Integer.class)).isEqualTo(2);
        }
    }
}
