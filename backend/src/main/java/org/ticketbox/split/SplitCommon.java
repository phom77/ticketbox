package org.ticketbox.split;

import com.ticketbox.infrastructure.BoundedAsyncConfiguration;
import com.ticketbox.infrastructure.security.*;
import com.ticketbox.shared.exception.GlobalExceptionHandler;
import com.ticketbox.shared.config.HealthController;
import com.ticketbox.shared.util.PhoneNormalizer;
import net.javacrumbs.shedlock.core.LockProvider;
import net.javacrumbs.shedlock.provider.jdbctemplate.JdbcTemplateLockProvider;
import net.javacrumbs.shedlock.spring.annotation.EnableSchedulerLock;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.*;
import org.springframework.core.annotation.Order;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.client.RestClient;
import org.springframework.web.filter.OncePerRequestFilter;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@Configuration
@Import({ReplicaDataSourceConfiguration.class, SecurityConfig.class, JwtService.class, JwtAuthenticationFilter.class,
        GlobalExceptionHandler.class, HealthController.class, PhoneNormalizer.class, BoundedAsyncConfiguration.class})
public class SplitCommon {
    @Bean
    public RestClient serviceClient(@Value("${split.token}") String token) {
        if (token.length() < 32) throw new IllegalArgumentException("Internal service token must have at least 32 characters");
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(2000);
        factory.setReadTimeout(5000);
        return RestClient.builder().requestFactory(factory).defaultHeader("X-Service-Token", token).build();
    }

    @Bean
    @Order(0)
    SecurityFilterChain internalSecurity(HttpSecurity http, @Value("${split.token}") String token) throws Exception {
        var expected = token.getBytes(StandardCharsets.UTF_8);
        var filter = new OncePerRequestFilter() {
            @Override
            protected void doFilterInternal(jakarta.servlet.http.HttpServletRequest request,
                    jakarta.servlet.http.HttpServletResponse response, jakarta.servlet.FilterChain chain)
                    throws java.io.IOException, jakarta.servlet.ServletException {
                String supplied = request.getHeader("X-Service-Token");
                if (supplied == null || !MessageDigest.isEqual(expected, supplied.getBytes(StandardCharsets.UTF_8))) {
                    response.sendError(401);
                    return;
                }
                chain.doFilter(request, response);
            }
        };
        return http.securityMatcher("/internal/split/**")
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(a -> a.anyRequest().permitAll())
                .addFilterBefore(filter, UsernamePasswordAuthenticationFilter.class).build();
    }
    @Bean
    org.flywaydb.core.api.callback.Callback cutoverFence() {
        return new org.flywaydb.core.api.callback.Callback() {
            public boolean supports(org.flywaydb.core.api.callback.Event event, org.flywaydb.core.api.callback.Context context) {
                return event == org.flywaydb.core.api.callback.Event.AFTER_MIGRATE;
            }
            public boolean canHandleInTransaction(org.flywaydb.core.api.callback.Event event, org.flywaydb.core.api.callback.Context context) {
                return true;
            }
            public String getCallbackName() { return "split-cutover-fence"; }
            public void handle(org.flywaydb.core.api.callback.Event event, org.flywaydb.core.api.callback.Context context) {
                try (var query=context.getConnection().createStatement();
                     var rows=query.executeQuery("SELECT count(*) FROM split_cutover_marker WHERE NOT ready")) {
                    rows.next();
                    if(rows.getLong(1)>0) throw new IllegalStateException("Service data cutover is incomplete; consult the migration manifest");
                } catch(java.sql.SQLException failure) {
                    throw new IllegalStateException("Cannot verify data ownership",failure);
                }
            }
        };
    }

}
