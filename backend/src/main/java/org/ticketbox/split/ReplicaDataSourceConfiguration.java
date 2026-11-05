package org.ticketbox.split;

import com.zaxxer.hikari.HikariDataSource;
import org.springframework.beans.factory.annotation.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.datasource.LazyConnectionDataSourceProxy;
import org.springframework.jdbc.datasource.lookup.AbstractRoutingDataSource;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import javax.sql.DataSource;
import java.util.Map;

@Configuration(proxyBeanMethods=false)
@ConditionalOnProperty(name="lab.replica.enabled", havingValue="true")
public class ReplicaDataSourceConfiguration {
    @Bean(destroyMethod="close")
    HikariDataSource primaryPool(@Value("${spring.datasource.url}") String url,
            @Value("${spring.datasource.username}") String user,
            @Value("${spring.datasource.password}") String password) {
        return pool(url,user,password,"lab-primary");
    }

    @Bean(destroyMethod="close")
    HikariDataSource replicaPool(@Value("${lab.replica.url}") String url,
            @Value("${spring.datasource.username}") String user,
            @Value("${spring.datasource.password}") String password) {
        return pool(url,user,password,"lab-replica");
    }

    @Bean @Primary
    DataSource dataSource(@Qualifier("primaryPool") DataSource primary,
                          @Qualifier("replicaPool") DataSource replica) {
        var router = new AbstractRoutingDataSource() {
            @Override protected Object determineCurrentLookupKey() {
                return ReplicaReadAspect.requested()
                        && TransactionSynchronizationManager.isActualTransactionActive()
                        && TransactionSynchronizationManager.isCurrentTransactionReadOnly() ? "replica" : "primary";
            }
        };
        router.setTargetDataSources(Map.of("primary",primary,"replica",replica));
        router.setDefaultTargetDataSource(primary);
        router.afterPropertiesSet();
        var lazy = new LazyConnectionDataSourceProxy(router);
        lazy.setDefaultAutoCommit(true);
        lazy.setDefaultTransactionIsolation(java.sql.Connection.TRANSACTION_READ_COMMITTED);
        return lazy;
    }

    @Bean ReplicaReadAspect replicaReadAspect() { return new ReplicaReadAspect(); }

    private HikariDataSource pool(String url, String user, String password, String name) {
        var pool = new HikariDataSource();
        pool.setJdbcUrl(url); pool.setUsername(user); pool.setPassword(password);
        pool.setPoolName(name); pool.setMaximumPoolSize(8); pool.setMinimumIdle(0);
        pool.setConnectionTimeout(5000);
        return pool;
    }
}
